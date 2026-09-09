import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, stat, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handleModelSettings, configuredModel } from "../../lib/server/model-settings";
import { ModelSettingsStore, modelIdentity } from "../../lib/server/model-settings-store";
import { MODEL_PRESETS, modelDefaults, type ModelKind } from "../../lib/ai/model-settings";
import {
  providerFetch,
  providerUrl,
  publicAddress,
  resolveProviderAddresses,
} from "../../lib/server/provider-http";

const request = (body: object, cookie = "", origin = "http://localhost", signal?: AbortSignal) =>
  new Request("http://localhost/api/model-settings", {
    method: "POST",
    headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
const draft = (kind: ModelKind, revision = 0) => ({
  key: `fake-private-${kind}-key`,
  revision,
});
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xiantu-model-settings-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ModelSettingsStore(directory);
  const env = {};
  const call = (body: object, cookie = "", fetcher?: typeof fetch, signal?: AbortSignal) =>
    handleModelSettings(request(body, cookie, "http://localhost", signal), { store, env, fetcher });
  const first = await call({ action: "read" });
  return { store, directory, call, cookie: first.headers.get("set-cookie")!.split(";")[0] };
}

test("separate browser credentials persist both models privately, never returning keys", async (t) => {
  const { store, directory, call, cookie } = await fixture(t);
  for (const kind of ["llm", "image"] as const) {
    const response = await call({ action: "save", kind, config: draft(kind) }, cookie);
    assert.equal(response.status, 200);
    assert.equal((await response.clone().json()).model.hasKey, true);
    assert.ok(!(await response.text()).includes(draft(kind).key));
  }
  const read = await (await call({ action: "read" }, cookie)).json();
  assert.equal(read.models.llm.model, MODEL_PRESETS.llm.model);
  assert.equal(read.models.llm.maxTokens, 8192);
  assert.equal(read.models.image.model, MODEL_PRESETS.image.model);
  const other = await (await call({ action: "read" })).json();
  assert.equal(other.models.llm.hasKey, false);
  assert.equal(other.models.image.model, MODEL_PRESETS.image.model);
  assert.equal(
    (
      await configuredModel(request({}, cookie), "llm", {
        store: new ModelSettingsStore(directory),
        env: {},
      })
    )?.key,
    draft("llm").key,
  );
  for (const file of await readdir(directory))
    assert.equal((await stat(path.join(directory, file))).mode & 0o777, 0o600);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  const cleared = await call({ action: "clear", kind: "image", revision: 1 }, cookie);
  assert.equal(cleared.status, 200);
  assert.equal(await configuredModel(request({}, cookie), "image", { store, env: {} }), null);
  assert.equal(
    (await configuredModel(request({}, cookie), "llm", { store, env: {} }))?.model,
    MODEL_PRESETS.llm.model,
  );
});

test("only key and revision are accepted; fixed parameters govern saves and actual provider requests", async (t) => {
  const { store, call, cookie } = await fixture(t);
  for (const field of [
    { baseUrl: "https://other.example/v1" },
    { model: "another-model" },
    { timeout: 1000 },
    { maxTokens: 100 },
    { enabled: false },
  ]) {
    const response = await call(
      { action: "save", kind: "llm", config: { ...draft("llm"), ...field } },
      cookie,
    );
    assert.equal(response.status, 400);
  }
  await call({ action: "save", kind: "llm", config: draft("llm") }, cookie);
  const kept = await call(
    { action: "save", kind: "llm", config: { key: "", revision: 1 } },
    cookie,
  );
  assert.equal(kept.status, 200);
  const config = await configuredModel(request({}, cookie), "llm", { store, env: {} });
  assert.deepEqual(config, {
    ...modelDefaults("llm"),
    enabled: true,
    key: draft("llm").key,
    revision: 2,
    mock: false,
  });
  const env = {
    XIANTU_AI_KEY: "platform-secret",
    XIANTU_AI_MODEL: "ignored-model",
    XIANTU_AI_MAX_TOKENS: "100",
    XIANTU_AI_TIMEOUT_MS: "1",
  };
  const read = await handleModelSettings(request({ action: "read" }), { store, env });
  assert.ok(!(await read.clone().text()).includes(env.XIANTU_AI_KEY));
  const summary = (await read.json()).models.llm;
  assert.equal(summary.source, "server");
  assert.equal(summary.model, MODEL_PRESETS.llm.model);
  assert.equal(summary.timeout, 30000);
  assert.equal(summary.maxTokens, 8192);
  const attempt = await handleModelSettings(
    request({ action: "save", kind: "llm", config: { key: "", revision: 0 } }),
    { store, env },
  );
  assert.equal(attempt.status, 400, "a platform key must not become a personal key");
});

test("legacy same-provider keys survive without rewriting files; different-provider keys are never moved", async (t) => {
  const { store, call, cookie } = await fixture(t);
  const id = modelIdentity(request({}, cookie)).id!;
  const original = await store.save(
    id,
    "llm",
    {
      ...modelDefaults("llm"),
      enabled: true,
      baseUrl: MODEL_PRESETS.llm.baseUrl + "/",
      model: "old-model",
      timeout: 1000,
      maxTokens: 100,
      key: "legacy-key",
    },
    0,
  );
  const config = await configuredModel(request({}, cookie), "llm", { store, env: {} });
  assert.equal(config?.key, "legacy-key");
  assert.equal(config?.model, MODEL_PRESETS.llm.model);
  assert.equal(config?.timeout, 30000);
  assert.deepEqual(
    await store.read(id, "llm"),
    original,
    "reading must preserve the old private file",
  );
  const different = await store.save(
    id,
    "image",
    {
      ...modelDefaults("image"),
      enabled: true,
      baseUrl: "https://previous.example/v1",
      key: "previous-provider-key",
    },
    0,
  );
  const state = (await (await call({ action: "read" }, cookie)).json()).models.image;
  assert.equal(state.needsKey, true);
  assert.equal(state.enabled, false);
  assert.equal(state.hasKey, true);
  assert.equal(await configuredModel(request({}, cookie), "image", { store, env: {} }), null);
  assert.equal(
    (await call({ action: "save", kind: "image", config: { key: "", revision: 1 } }, cookie))
      .status,
    400,
  );
  assert.deepEqual(await store.read(id, "image"), different);
  assert.equal(
    (await call({ action: "save", kind: "image", config: draft("image", 1) }, cookie)).status,
    200,
  );
  assert.equal(
    (await configuredModel(request({}, cookie), "image", { store, env: {} }))?.key,
    draft("image").key,
  );
  await call({ action: "clear", kind: "image", revision: 2 }, cookie);
  assert.equal(
    await configuredModel(request({}, cookie), "image", {
      store,
      env: { XIANTU_IMAGE_KEY: "platform-key" },
    }),
    null,
  );
});

test("stale and concurrent writes reject rather than overwrite the latest configuration", async (t) => {
  const { call, cookie } = await fixture(t);
  const responses = await Promise.all(
    [1, 2].map((n) =>
      call(
        { action: "save", kind: "llm", config: { ...draft("llm"), key: `different-key-${n}` } },
        cookie,
      ),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await call({ action: "clear", kind: "llm", revision: 0 }, cookie)).status, 409);
  assert.equal((await (await call({ action: "read" }, cookie)).json()).models.llm.revision, 1);
});

test("cross-origin, private upstream, malformed and oversized requests cannot write configuration", async (t) => {
  const { store, directory, call, cookie } = await fixture(t);
  assert.equal(
    (
      await handleModelSettings(
        request(
          { action: "save", kind: "llm", config: draft("llm") },
          cookie,
          "https://foreign.example",
        ),
        { store, env: {} },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        { action: "save", kind: "llm", config: { ...draft("llm"), key: "x".repeat(17000) } },
        cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (await call({ action: "save", kind: "llm", config: { ...draft("llm"), extra: true } }, cookie))
      .status,
    400,
  );
  assert.equal(
    (
      await call(
        { action: "save", kind: "llm", config: { ...draft("llm"), maxTokens: 8193 } },
        cookie,
      )
    ).status,
    400,
  );
  for (const baseUrl of [
    "http://localhost:8000",
    "https://127.0.0.1/v1",
    "https://[::1]/v1",
    "https://169.254.169.254/v1",
    "https://user:pass@api.example/v1",
    "https://api.example/v1?key=hidden",
  ])
    assert.equal(
      (await call({ action: "save", kind: "llm", config: { ...draft("llm"), baseUrl } }, cookie))
        .status,
      400,
    );
  assert.deepEqual(await readdir(directory), []);
});

test("LLM test uses the fixed model and strict schema without saving credentials or exposing responses", async (t) => {
  const { call, cookie } = await fixture(t);
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, `${MODEL_PRESETS.llm.baseUrl}/chat/completions`);
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${draft("llm").key}`);
    const body = JSON.parse(init?.body as string);
    assert.equal(body.model, MODEL_PRESETS.llm.model);
    assert.equal(body.max_completion_tokens, 8192);
    assert.equal(body.response_format.json_schema.strict, true);
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: "clarify",
              reply: "服务商返回的正文不应出现在测试结果",
              terms: null,
            }),
          },
        },
      ],
    });
  };
  const result = await call({ action: "test", kind: "llm", config: draft("llm") }, cookie, fetcher);
  assert.equal(result.status, 200);
  const text = await result.text();
  assert.ok(!text.includes(draft("llm").key));
  assert.ok(!text.includes("服务商返回"));
  assert.equal(calls, 1);
  assert.equal((await (await call({ action: "read" }, cookie)).json()).models.llm.hasKey, false);
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSr8AAAAASUVORK5CYII=",
  "base64",
);
test("image test uses independent credentials and handles base64 or public URL without forwarding the key", async (t) => {
  const { call, cookie } = await fixture(t);
  for (const mode of ["base64", "url"]) {
    const urls: string[] = [];
    const result = await call(
      { action: "test", kind: "image", config: draft("image") },
      cookie,
      async (url, init) => {
        urls.push(String(url));
        if (urls.length === 1) {
          assert.equal(url, `${MODEL_PRESETS.image.baseUrl}/images/generations`);
          assert.equal(
            new Headers(init?.headers).get("authorization"),
            `Bearer ${draft("image").key}`,
          );
          assert.equal(JSON.parse(init?.body as string).model, MODEL_PRESETS.image.model);
          assert.equal(JSON.parse(init?.body as string).n, 1);
          return Response.json({
            data: [
              mode === "base64"
                ? { b64_json: png.toString("base64") }
                : { url: "https://images.example/result.png?signature=abc" },
            ],
          });
        }
        assert.equal(new Headers(init?.headers).get("authorization"), null);
        return new Response(png);
      },
    );
    assert.equal(result.status, 200);
    assert.match((await result.json()).image, /^data:image\/png;base64,/);
    assert.equal(urls.length, mode === "base64" ? 1 : 2);
  }
});

test("provider redirects, malformed image results, internal download URLs and upstream secrets fail closed", async (t) => {
  const { call, cookie } = await fixture(t);
  for (const response of [
    new Response("provider secret", {
      status: 302,
      headers: { Location: "https://other.example" },
    }),
    Response.json({ error: draft("image").key }, { status: 401 }),
    Response.json({ data: [{ url: "https://127.0.0.1/private" }] }),
    Response.json({
      data: [{ b64_json: Buffer.from("<svg onload=alert(1)>").toString("base64") }],
    }),
  ]) {
    let calls = 0;
    const result = await call(
      { action: "test", kind: "image", config: draft("image") },
      cookie,
      async () => {
        calls++;
        return response;
      },
    );
    assert.equal(result.status, 502);
    assert.equal(calls, 1);
    assert.ok(!(await result.text()).includes(draft("image").key));
  }
});

test("public HTTPS validation rejects private, encoded, metadata and transition addresses", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "100.100.100.200",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2002:7f00:1::",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  assert.throws(() => providerUrl("https://2130706433/v1"));
  assert.throws(() => providerUrl("https://0x7f000001/v1"));
  await assert.rejects(providerFetch("https://127.0.0.1"));
});

test("failed disk writes never acknowledge success and invalid server defaults still allow personal setup", async (t) => {
  const { directory, store, cookie } = await fixture(t);
  class BrokenStore extends ModelSettingsStore {
    override async save(): Promise<never> {
      throw new Error("private-storage-path-and-key");
    }
  }
  const response = await handleModelSettings(
    request({ action: "save", kind: "llm", config: draft("llm") }, cookie),
    { store: new BrokenStore(directory), env: {} },
  );
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private-storage"));
  const defaults = await handleModelSettings(request({ action: "read" }, cookie), {
    store,
    env: {
      XIANTU_AI_KEY: "invalid-default-key",
      XIANTU_AI_BASE_URL: "https://previous.example/v1",
    },
  });
  assert.equal(defaults.status, 200);
  const text = await defaults.text();
  assert.ok(text.includes("可填写个人配置"));
  assert.ok(!text.includes("invalid-default-key"));
});

test("cancelled or timed-out image requests finish without saving or late success", async (t) => {
  const { call, cookie } = await fixture(t);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 30);
  const result = await call(
    { action: "test", kind: "image", config: draft("image") },
    cookie,
    async (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        }),
      ),
    abort.signal,
  );
  clearTimeout(timer);
  assert.equal(result.status, 499);
  assert.equal((await (await call({ action: "read" }, cookie)).json()).models.image.hasKey, false);
});

test("opt-in public DNS uses no credentials and still rejects private or mixed answers", async () => {
  const resolver: typeof fetch = async (url, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    const u = new URL(String(url));
    assert.equal(u.origin, "https://dns.google");
    assert.equal(u.searchParams.get("name"), "provider.example");
    const type = Number(u.searchParams.get("type"));
    return Response.json({
      Status: 0,
      Answer: [{ type, data: type === 1 ? "8.8.8.8" : "2606:4700:4700::1111" }],
    });
  };
  assert.equal(
    (await resolveProviderAddresses("provider.example", undefined, true, resolver)).length,
    2,
  );
  for (const address of ["127.0.0.1", "198.18.0.59", "169.254.169.254"]) {
    await assert.rejects(
      resolveProviderAddresses("provider.example", undefined, true, async () =>
        Response.json({
          Status: 0,
          Answer: [
            { type: 1, data: "8.8.8.8" },
            { type: 1, data: address },
          ],
        }),
      ),
    );
  }
  await assert.rejects(
    resolveProviderAddresses("provider.example", undefined, true, async () =>
      Response.json({ Status: 3 }),
    ),
  );
});

test("both models use the fixed public HTTP service while local and metadata HTTP stay blocked", async (t) => {
  const { call, cookie } = await fixture(t);
  const baseUrl = MODEL_PRESETS.llm.baseUrl;
  assert.equal(providerUrl(baseUrl).href, baseUrl);
  for (const kind of ["llm", "image"] as const) {
    assert.equal((await call({ action: "save", kind, config: draft(kind) }, cookie)).status, 200);
    const metadata = (await (await call({ action: "read" }, cookie)).json()).models[kind];
    assert.equal(metadata.baseUrl, baseUrl);
  }
  for (const url of [
    "http://127.0.0.1",
    "http://10.0.0.1",
    "http://169.254.169.254",
    "http://198.18.0.2",
  ])
    assert.throws(() => providerUrl(url));
});
