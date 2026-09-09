import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createWorld, scene } from "../../lib/game/engine";
import {
  canonicalTerms,
  negotiationContext,
  type NegotiationProposal,
} from "../../lib/game/negotiation";
import { PACK } from "../../lib/game/content/official";
import { recordFact } from "../../lib/game/knowledge";
import { handleNegotiation, providerConfig } from "../../lib/server/negotiation";
import type { Command } from "../../lib/game/types";
const profile = {
  name: "交涉测试",
  sex: "female" as const,
  aptitude: 75,
  artifact: "focus" as const,
  mode: "simple" as const,
  appearance: { face: 0, hair: 0, color: 0 },
};
function setup() {
  let w = createWorld(12345, profile, "negotiation-test");
  for (let i = 0; i < 3; i++) {
    const n = scene(w)!;
    w = applyCommand(
      w,
      { type: "choose", nodeId: n.id, choiceId: n.choices[0].id },
      `setup:${i}`,
      w.revision,
    );
  }
  return w;
}
const proposal: NegotiationProposal = {
  intent: "invite",
  reply: "请核对上述条件。",
  terms: canonicalTerms(),
};
function command(w: ReturnType<typeof setup>): Command {
  return {
    type: "adoptNegotiation",
    proposalId: "proposal:1",
    sessionId: "session:1",
    saveId: w.saveId,
    revision: w.revision,
    target: PACK.roles.primary,
    proposal,
    confirmed: true,
  };
}
test("equivalent fixed choice and AI proposal establish the same resources and promise; adoption survives load once", () => {
  const w = setup(),
    node = scene(w)!;
  const fixed = applyCommand(
    w,
    { type: "choose", nodeId: node.id, choiceId: node.choices[0].id },
    "fixed",
    w.revision,
  );
  const c = command(w),
    ai = applyCommand(w, c, "ai", w.revision);
  assert.deepEqual(ai.player, fixed.player);
  assert.deepEqual(ai.npcs, fixed.npcs);
  assert.deepEqual(ai.agreement, fixed.agreement);
  assert.deepEqual(ai.relations, fixed.relations);
  assert.deepEqual(ai.rng, fixed.rng);
  assert.equal(applyCommand(ai, c, "ai", w.revision), ai);
  assert.equal(JSON.parse(JSON.stringify(ai)).negotiations[0].proposal.reply, proposal.reply);
  assert.throws(() =>
    applyCommand(ai, { ...c, revision: ai.revision } as Command, "twice", ai.revision),
  );
});
test("ambiguous, unauthorized, absent, deceased, poor, full-party and stale proposals have no effects", () => {
  for (const mutate of [
    (w: any, c: any) => (c.proposal.terms = null),
    (w: any, c: any) => (c.proposal.realm = 4),
    (w: any, c: any) => (c.proposal.terms.recipient = "stranger"),
    (w: any, c: any) => (c.proposal.terms.members[1] = "stranger"),
    (w: any, c: any) => (w.npcs[0].location = "inn"),
    (w: any, c: any) => {
      w.npcs[0].alive = false;
      w.npcs[0].hp = 0;
    },
    (w: any, c: any) => (w.player.stones = 0),
    (w: any, c: any) => w.party.push(PACK.roles.companion),
    (w: any, c: any) => c.revision--,
    (w: any, c: any) => (c.saveId = "other"),
    (w: any, c: any) => (c.confirmed = false),
  ]) {
    const w = setup(),
      c = structuredClone(command(w));
    mutate(w, c);
    const before = JSON.stringify(w);
    assert.throws(() => applyCommand(w, c, "reject", w.revision));
    assert.equal(JSON.stringify(w), before);
  }
});
test("AI conversation sees only facts known to both participants", () => {
  const w = setup();
  recordFact(w, "secret", "陌生人的秘密", [w.npcs[3].id]);
  recordFact(w, "secret", "林晚未告知玩家的秘密", [PACK.roles.primary]);
  assert.ok(!JSON.stringify(negotiationContext(w, PACK.roles.primary)).includes("秘密"));
});
const input = () => ({
  saveId: "a",
  sessionId: "b",
  revision: 0,
  text: "第一株凝元草给你，其余归我，路费2灵石",
  context: negotiationContext(setup(), PACK.roles.primary),
});
const request = (data: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/negotiation", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
const config = {
  baseUrl: "https://provider.example/v1",
  key: "mock-secret-never-return",
  model: "configured-model",
  timeout: 1000,
  maxTokens: 8192,
  mock: false,
};
let serial = 0;
const options = (fetcher?: typeof fetch) => ({ config, fetcher, rateKey: `test-${++serial}` });
test("server rejects missing configuration, client proxy overrides, cross-origin requests and oversized bodies", async () => {
  assert.equal(
    (await handleNegotiation(request(input()), { config: null, rateKey: "missing" })).status,
    503,
  );
  assert.equal(
    (await handleNegotiation(request({ ...input(), baseUrl: "https://evil.example" }), options()))
      .status,
    400,
  );
  assert.equal(
    (await handleNegotiation(request(input(), "https://evil.example"), options())).status,
    403,
  );
  assert.equal(
    (await handleNegotiation(request({ ...input(), text: "a".repeat(20000) }), options())).status,
    400,
  );
  assert.throws(() =>
    providerConfig({
      XIANTU_AI_KEY: "x",
      XIANTU_AI_BASE_URL: "http://unsafe",
      XIANTU_AI_MODEL: "x",
    }),
  );
  assert.throws(() =>
    providerConfig({ XIANTU_AI_KEY: "x", XIANTU_AI_MODEL: "x", XIANTU_AI_MAX_TOKENS: "99999" }),
  );
  assert.equal(
    providerConfig({ XIANTU_AI_KEY: "x", XIANTU_AI_MODEL: "x", XIANTU_AI_MAX_TOKENS: "8192" })
      ?.maxTokens,
    8192,
  );
  assert.throws(() =>
    providerConfig({ XIANTU_AI_KEY: "x", XIANTU_AI_MODEL: "x", XIANTU_AI_MAX_TOKENS: "8193" }),
  );
});
test("structured upstream uses configured model and bounded tokens; credentials never enter output", async () => {
  let calls = 0;
  const result = await handleNegotiation(
    request(input()),
    options(async (url, init) => {
      calls++;
      assert.equal(url, "https://provider.example/v1/chat/completions");
      const body = JSON.parse(init!.body as string);
      assert.equal(body.model, config.model);
      assert.equal(body.max_completion_tokens, 8192);
      assert.equal(body.response_format.json_schema.strict, true);
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({ ...proposal, reply: "<img src=x onerror=alert(1)>" }),
            },
          },
        ],
      });
    }),
  );
  assert.equal(result.status, 200);
  const text = await result.text();
  assert.ok(!text.includes(config.key));
  assert.ok(text.includes("<img"));
  assert.equal(calls, 1);
});
test("provider errors, malformed JSON, timeout, mock clarification and rate limits are bounded", async () => {
  for (const response of [
    Response.json({ error: "never echo provider secret" }, { status: 500 }),
    Response.json({ choices: [{ message: { content: "not json" } }] }),
  ]) {
    const result = await handleNegotiation(
      request(input()),
      options(async () => response),
    );
    assert.equal(result.status, 502);
    assert.ok(!(await result.text()).includes("never echo"));
  }
  const timeout = await handleNegotiation(
    request(input()),
    options(
      async (_, init) =>
        new Promise((_, reject) =>
          init!.signal!.addEventListener("abort", () => reject(new Error("timeout"))),
        ),
    ),
  );
  assert.equal(timeout.status, 504);
  const mock = providerConfig({ XIANTU_AI_MOCK: "1" })!;
  const value = await (
    await handleNegotiation(request({ ...input(), text: "平分吧" }), {
      config: mock,
      rateKey: "mock",
    })
  ).json();
  assert.equal(value.proposal.intent, "clarify");
  assert.equal(value.proposal.terms, null);
  for (let i = 0; i < 6; i++)
    await handleNegotiation(request(input()), { config: mock, rateKey: "limit" });
  assert.equal(
    (await handleNegotiation(request(input()), { config: mock, rateKey: "limit" })).status,
    429,
  );
});

test("proxy origins use an explicit whitelist and independent sessions do not share quota", async () => {
  const { allowedOrigins, clientRateIdentity } = await import(
    "../../lib/server/negotiation-security"
  );
  const req = new Request("http://internal:8080/api/negotiation", {
    method: "POST",
    headers: {
      Origin: "https://game.example",
      "Content-Type": "application/json",
      "CF-Connecting-IP": "192.0.2.1",
    },
    body: JSON.stringify(input()),
  });
  const env = { XIANTU_ALLOWED_ORIGINS: "https://game.example" };
  assert.deepEqual(allowedOrigins(req, env), ["https://game.example"]);
  assert.deepEqual(allowedOrigins(req, {}), []);
  const a = await clientRateIdentity(req, env),
    b = await clientRateIdentity(req, env);
  assert.notEqual(a.rateKey, b.rateKey);
  assert.ok(a.cookie?.includes("HttpOnly; SameSite=Strict"));
  assert.ok(a.cookie?.includes("Secure"));
  const repeat = new Request(req.clone(), {
    headers: { ...Object.fromEntries(req.headers), Cookie: a.cookie!.split(";")[0] },
  });
  assert.equal((await clientRateIdentity(repeat, env)).rateKey, a.rateKey);
  assert.equal(
    (await clientRateIdentity(req, { XIANTU_TRUST_CF_IP: "1" })).rateKey,
    "cf:192.0.2.1",
  );
  const opts = { config: { ...config, mock: true }, allowedOrigins: allowedOrigins(req, env) };
  for (let i = 0; i < 6; i++)
    assert.equal(
      (await handleNegotiation(req.clone(), { ...opts, rateKey: a.rateKey })).status,
      200,
    );
  assert.equal((await handleNegotiation(req.clone(), { ...opts, rateKey: a.rateKey })).status, 429);
  assert.equal((await handleNegotiation(req.clone(), { ...opts, rateKey: b.rateKey })).status, 200);
  assert.equal(
    (
      await handleNegotiation(req.clone(), {
        ...opts,
        allowedOrigins: ["https://another.example"],
        rateKey: b.rateKey,
      })
    ).status,
    403,
  );
});
