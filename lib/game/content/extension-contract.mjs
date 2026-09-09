import { z } from "zod";
export const CAPABILITIES = [
  "progress.v1",
  "meet.v1",
  "starterManual.v1",
  "buyItem.v1",
  "experience.v1",
  "agreement.v1",
];
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,119}$/);
const text = z.string().min(1).max(4000);
const version = z.string().regex(/^\d+\.\d+\.\d+$/);
export const registrationSchema = z
  .object({
    packId: id,
    packVersion: version,
    contentApiVersion: z.literal(2),
    title: text,
    requiresCapabilities: z.array(z.enum(CAPABILITIES)).max(6),
    dependencies: z
      .array(
        z
          .object({ packId: id, packVersion: version, hash: z.string().regex(/^[0-9a-f]{64}$/) })
          .strict(),
      )
      .max(8),
    entryFiles: z
      .object({
        definitions: z.literal("definitions.json"),
        storylets: z.literal("storylets.json"),
        visuals: z.literal("visuals.json"),
        outline: z.literal("outline.md"),
        acceptance: z.literal("acceptance.md"),
        art: z.literal("art/manifest.json").optional(),
        journey: z.literal("journey.json").optional(),
      })
      .strict(),
    author: text,
    license: text,
    flags: z.array(id).max(40),
    references: z.array(id).max(20),
  })
  .strict();
export const extensionSchema = z
  .object({
    manifest: registrationSchema,
    definitions: z
      .object({
        characters: z
          .array(
            z
              .object({
                id,
                name: z.string().min(1).max(16),
                sex: z.enum(["female", "male"]),
                age: z.number().int().min(18).max(70),
                aptitude: z.number().int().min(1).max(100),
                realm: z.number().int().min(0).max(4),
                personality: text,
                sect: text,
                goal: text,
                location: id,
                portraitId: id.optional(),
                homeVisitIntervalDays: z.number().int().min(1).max(30).optional(),
              })
              .strict(),
          )
          .max(10),
        locations: z
          .record(
            id,
            z
              .object({
                name: text,
                subtitle: text,
                body: text,
                kind: z.enum(["market", "inn", "gate"]),
                destinations: z.array(id).min(1).max(6),
                visualId: id,
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
    journey: z
      .object({
        order: z.number().int().min(1).max(20),
        regionName: text,
        minRealm: z.number().int().min(0).max(4),
        minExpeditions: z.number().int().min(0).max(10),
        travelDays: z.number().int().min(1).max(30),
        sceneIntervalDays: z.number().int().min(1).max(30),
        clueCount: z.number().int().min(1).max(20),
        introId: id,
        lead: text,
        routeLead: text,
        locations: z.object({ market: id, inn: id, gate: id }).strict(),
      })
      .strict()
      .optional(),
    visuals: z.record(
      id,
      z.object({ assetId: id, alt: text, status: z.enum(["reused", "planned", "owned"]) }).strict(),
    ),
    art: z
      .object({
        assets: z.record(
          id,
          z
            .object({
              file: z.string().regex(/^art\/images\/[a-z0-9-]+\.png$/),
              url: z.string().regex(/^\/art\/[a-zA-Z0-9_.-]+\/[a-z0-9-]+\.png$/),
              alt: text,
              width: z.number().int().positive(),
              height: z.number().int().positive(),
              kind: z.enum(["scene", "portrait"]),
            })
            .strict(),
        ),
      })
      .strict()
      .optional(),
    storylets: z
      .array(
        z
          .object({
            id,
            title: text,
            eyebrow: text,
            body: text,
            quote: text.optional(),
            visualId: id,
            participants: z.array(id).max(3),
            priority: z.number().int().min(0).max(100),
            minRealm: z.number().int().min(0).max(4).optional(),
            conditions: z
              .array(
                z
                  .object({
                    fact: id,
                    op: z.enum(["eq", "gte"]),
                    value: z.union([z.boolean(), z.string().max(160), z.number().int()]),
                  })
                  .strict(),
              )
              .max(20),
            choices: z
              .array(
                z
                  .object({
                    id,
                    label: text,
                    hint: text,
                    reply: text,
                    effects: z
                      .array(
                        z.discriminatedUnion("kind", [
                          z.object({ kind: z.literal("progress"), key: id }).strict(),
                          z.object({ kind: z.literal("meet"), target: id }).strict(),
                          z.object({ kind: z.literal("starterManual") }).strict(),
                          z
                            .object({
                              kind: z.literal("buyItem"),
                              item: z.enum(["healing", "pills", "grass"]),
                            })
                            .strict(),
                          z.object({ kind: z.literal("experience"), target: id, text }).strict(),
                          z.object({ kind: z.literal("agreement") }).strict(),
                        ]),
                      )
                      .max(5),
                  })
                  .strict(),
              )
              .min(1)
              .max(6),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict();
export function validateExtension(input, official) {
  const p = extensionSchema.parse(input),
    m = p.manifest;
  const own = (value) => value.startsWith(m.packId + ".");
  const check = (ok, field) => {
    if (!ok) throw new Error(`${m.packId}: ${field}`);
  };
  const unique = (values, field) =>
    check(new Set(values).size === values.length, `${field} ID 重复`);
  check(m.packId !== "official.qingshi", "不能覆盖官方包");
  const actorIds = [...m.references, ...p.definitions.characters.map((a) => a.id)];
  unique(actorIds, "人物");
  check(
    m.references.every((ref) => Object.values(official.roles).includes(ref)),
    "references 引用了未声明依赖的角色",
  );
  for (const value of [
    ...m.flags,
    ...p.definitions.characters.map((a) => a.id),
    ...Object.keys(p.visuals),
    ...p.storylets.map((n) => n.id),
    ...Object.keys(p.art?.assets ?? {}),
    ...Object.keys(p.definitions.locations ?? {}),
  ])
    check(own(value), `命名空间越界 ${value}`);
  unique(m.flags, "flags");
  const locations = ["market", "inn", "gate", ...Object.keys(p.definitions.locations ?? {})];
  for (const actor of p.definitions.characters)
    check(locations.includes(actor.location), `${actor.id}.location 未知`);
  for (const [key, place] of Object.entries(p.definitions.locations ?? {})) {
    check(place.visualId in p.visuals, `${key}.visualId 未知`);
    check(
      place.destinations.every((to) => locations.includes(to) && to !== key),
      `${key}.destinations 未知`,
    );
  }
  if (p.journey) {
    check(
      p.storylets.some((n) => n.id === p.journey.introId),
      "journey.introId 未知",
    );
    check(
      Object.values(p.journey.locations).every((loc) => locations.includes(loc)),
      "journey.locations 未知",
    );
    for (const [kind, loc] of Object.entries(p.journey.locations))
      check(
        loc === kind || p.definitions.locations?.[loc]?.kind === kind,
        "journey 地点类型不匹配",
      );
  }
  check(Boolean(m.entryFiles.journey) === Boolean(p.journey), "journey 声明与数据不一致");
  unique(
    p.storylets.map((n) => n.id),
    "storylets",
  );
  check(Boolean(m.entryFiles.art) === Boolean(p.art), "art 声明与数据不一致");
  for (const [key, asset] of Object.entries(p.art?.assets ?? {}))
    check(
      asset.url === `/art/${m.packId}/${asset.file.slice("art/images/".length)}`,
      `art.${key}.url 命名空间或文件名不匹配`,
    );
  for (const [key, v] of Object.entries(p.visuals))
    check(
      v.status === "planned" ||
        (v.status === "owned"
          ? Object.hasOwn(p.art?.assets ?? {}, v.assetId)
          : official.assets.includes(v.assetId)),
      `visuals.${key}.assetId 未知`,
    );
  for (const actor of p.definitions.characters) {
    if (!actor.portraitId) continue;
    const slot = p.visuals[actor.portraitId];
    check(own(actor.portraitId) && Boolean(slot), `${actor.id}.portraitId 未知或越界`);
    if (slot.status === "owned")
      check(
        p.art.assets[slot.assetId].kind === "portrait",
        `${actor.id}.portraitId 必须引用 portrait 资源`,
      );
  }
  const facts = {
    location: "string",
    "player.stones": "number",
    "player.manual": "boolean",
    "player.realm": "number",
    "player.expeditions": "number",
    "official.outcome": "string",
  };
  for (const flag of m.flags) facts[`flag.${flag}`] = "boolean";
  for (const actor of actorIds)
    for (const [key, type] of Object.entries({
      present: "boolean",
      alive: "boolean",
      known: "boolean",
      trust: "number",
    }))
      facts[`actor.${actor}.${key}`] = type;
  const capability = {
    progress: "progress.v1",
    meet: "meet.v1",
    starterManual: "starterManual.v1",
    buyItem: "buyItem.v1",
    experience: "experience.v1",
    agreement: "agreement.v1",
  };
  for (const n of p.storylets) {
    check(n.visualId in p.visuals, `${n.id}.visualId 未知`);
    check(
      n.participants.every((a) => actorIds.includes(a)),
      `${n.id}.participants 未知`,
    );
    unique(n.participants, `${n.id}.participants`);
    unique(
      n.choices.map((c) => c.id),
      `${n.id}.choices`,
    );
    check(
      n.choices.some((c) => c.effects.length === 0),
      `${n.id} 缺少无代价退出选项`,
    );
    for (const c of n.conditions) {
      check(typeof c.value === facts[c.fact], `${n.id}.conditions.${c.fact} 类型或事实未知`);
      check(
        c.op !== "gte" || facts[c.fact] === "number",
        `${n.id}.conditions.${c.fact} 仅数值支持 gte`,
      );
      if (c.fact === "location")
        check([...locations, "ruins"].includes(c.value), `${n.id}.location 未知`);
    }
    for (const c of n.choices)
      for (const e of c.effects) {
        check(
          m.requiresCapabilities.includes(capability[e.kind]),
          `${n.id}.${c.id} 未声明能力 ${capability[e.kind]}`,
        );
        if (e.kind === "progress") check(m.flags.includes(e.key), `${n.id}.${c.id}.key 越权`);
        if (e.kind === "meet" || e.kind === "experience")
          check(n.participants.includes(e.target), `${n.id}.${c.id}.target 必须在场参与`);
        if (e.kind === "agreement")
          check(
            Object.values(official.roles).every((a) => n.participants.includes(a)),
            `${n.id}.${c.id} 约定需要双方参与`,
          );
      }
  }
  const tokens = JSON.stringify(p.storylets).matchAll(/\{\{([^{}]+)\}\}/g);
  for (const [, token] of tokens)
    check(
      token === "player.name" || actorIds.some((id) => token === `${id}.name`),
      `未知文本占位符 ${token}`,
    );
  return p;
}
export function validateRegistry(entries, official) {
  const seen = new Set(["official.qingshi"]);
  const byId = new Map([["official.qingshi", { version: official.version, hash: official.hash }]]);
  for (const entry of entries) {
    const m = entry.data.manifest;
    if (seen.has(m.packId)) throw new Error(`包 ID 重复 ${m.packId}`);
    seen.add(m.packId);
    byId.set(m.packId, { version: m.packVersion, hash: entry.hash });
  }
  for (const { data: p } of entries) {
    for (const d of p.manifest.dependencies) {
      const found = byId.get(d.packId);
      if (!found || found.version !== d.packVersion || found.hash !== d.hash)
        throw new Error(`${p.manifest.packId}: 依赖版本或摘要不匹配 ${d.packId}`);
    }
    if (!p.manifest.dependencies.some((d) => d.packId === "official.qingshi"))
      throw new Error(`${p.manifest.packId}: 缺少官方依赖`);
  }
  const visiting = new Set(),
    done = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw new Error(`循环依赖 ${id}`);
    if (done.has(id) || id === "official.qingshi") return;
    visiting.add(id);
    for (const d of entries.find((e) => e.data.manifest.packId === id).data.manifest.dependencies)
      visit(d.packId);
    visiting.delete(id);
    done.add(id);
  };
  for (const id of seen) visit(id);
  return entries;
}
