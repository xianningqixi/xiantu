import { z } from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9_.-]+$/);
const text = z.string().min(1).max(6000);
const location = z.enum(['market', 'inn', 'gate', 'ruins']);
const role = z.enum(['primary', 'companion']);
const effect = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('meet'), target: role }).strict(),
  z.object({ kind: z.literal('learn') }).strict(),
  z.object({ kind: z.literal('flag'), key: id }).strict(),
  z.object({ kind: z.literal('agreement') }).strict(),
]);
export const storySchema = z.array(z.object({
  id, title: text, eyebrow: text, body: text, quote: text.optional(), portrait: z.boolean(),
  visualId: id, portraitId: id.optional(),
  conditions: z.array(z.object({ fact: id, op: z.enum(['eq', 'gte']), value: z.union([z.string(), z.number(), z.boolean()]) }).strict()).min(1),
  choices: z.array(z.object({ id, label: text, hint: text, reply: text, effects: z.array(effect) }).strict()).max(6),
}).strict()).min(1).max(200);
const place = z.object({ name: text, subtitle: text, body: text, destinations: z.array(location), visualId: id }).strict();
const character = z.object({
  id, name: z.string().min(1).max(16), sex: z.enum(['female', 'male']), age: z.number().int().min(18).max(70),
  realm: z.number().int().min(0).max(4), aptitude: z.number().int().min(1).max(100), personality: text, sect: text, goal: text,
  xp: z.number().int().nonnegative(), stones: z.number().int().nonnegative(), portraitId: id.nullable(), roleDescription: text,
}).strict();
const transition = z.object({ eyebrow: text, title: text, body: text, visualId: id }).strict();
export const contract = z.object({
  manifest: z.object({ id, version: z.string().regex(/^\d+\.\d+\.\d+$/), contentApiVersion: z.literal(1), rulesVersion: z.literal('0.1.1'), title: text,
    roles: z.object({ primary: id, companion: id }).strict(), declaredFlags: z.array(id).min(3),
    files: z.object({ story: z.literal('storylets.json'), locations: z.literal('locations.json'), characters: z.literal('characters.json'), presentation: z.literal('presentation.json'), art: z.literal('art/manifest.json'), outline: z.literal('outline.md') }).strict(),
  }).strict(),
  story: storySchema,
  locations: z.object({ market: place, inn: place, gate: place, ruins: place }).strict(),
  characters: z.object({ primary: character, companion: character }).strict(),
  presentation: z.object({
    prologue: z.object({ eyebrow: text, title: z.array(text).min(1).max(3), body: z.array(text).min(1).max(6), note: text, visualId: id }).strict(),
    lootReturn: transition, lootSettle: transition,
    notices: z.object({ arrival: text, arrivalEvent: text, agreement: text, party: text, fulfilled: text, breached: text, compensationEvent: text, compensated: text }).strict(),
  }).strict(),
  art: z.object({ assets: z.record(id, z.object({ file: z.string().regex(/^art\/images\/[a-zA-Z0-9_.-]+\.(png|jpg|jpeg|webp)$/), url: z.string().regex(/^\/art\/[a-zA-Z0-9_.-]+\.(png|jpg|jpeg|webp)$/), alt: text, width: z.number().int().positive(), height: z.number().int().positive(), kind: z.enum(['scene', 'portrait']), subject: text }).strict()) }).strict(),
}).strict();

/** Shared by the build script and runtime loader. JSON can describe only the implemented content API. */
export function validateContent(input) {
  const p = contract.parse(input);
  const assert = (ok, message) => { if (!ok) throw new Error(`内容包：${message}`); };
  const unique = (values, label) => assert(new Set(values).size === values.length, `${label} 重复`);
  unique(p.story.map(n => n.id), '故事节点 ID');
  unique(p.manifest.declaredFlags, '进度标记');
  for (const flag of ['met', 'goal', 'reunion']) assert(p.manifest.declaredFlags.includes(flag), `缺少必要标记 ${flag}`);
  const factTypes = { location: 'string', primaryPresent: 'boolean', manual: 'boolean', outcome: 'string', sinceSettlement: 'number', hasAgreement: 'boolean', canInvite: 'boolean' };
  for (const flag of p.manifest.declaredFlags) { assert(!(flag in factTypes), `进度标记覆盖保留事实 ${flag}`); factTypes[flag] = 'boolean'; }
  const visual = (ref, kind, context) => assert(p.art.assets[ref]?.kind === kind, `${context} 引用无效的 ${kind} 视觉 ID：${ref}`);
  const ids = Object.values(p.manifest.roles);
  unique(ids, '角色 ID'); assert(!ids.includes('PLAYER'), 'NPC 不能绑定玩家身份');
  for (const [key, c] of Object.entries(p.characters)) {
    assert(c.id === p.manifest.roles[key], `${key} 角色 ID 与清单不一致`);
    assert(c.xp <= [20, 40, 60, 100, 100][c.realm], `${key} 初始修为超过境界上限`);
    if (c.portraitId) visual(c.portraitId, 'portrait', key);
  }
  for (const [key, place] of Object.entries(p.locations)) visual(place.visualId, 'scene', key);
  for (const [key, view] of Object.entries(p.presentation)) if (key !== 'notices') visual(view.visualId, 'scene', key);
  for (const n of p.story) {
    unique(n.choices.map(c => c.id), `${n.id} 的选项 ID`);
    visual(n.visualId, 'scene', n.id);
    if (n.portrait) { assert(!!n.portraitId, `${n.id} 缺少人物视觉 ID`); visual(n.portraitId, 'portrait', n.id); }
    for (const c of n.conditions) {
      assert(c.fact in factTypes && typeof c.value === factTypes[c.fact], `${n.id} 的条件事实或值类型无效：${c.fact}`);
      assert(c.op !== 'gte' || factTypes[c.fact] === 'number', `${n.id} 只有数字事实支持 gte`);
      if (c.fact === 'location') assert(c.value in p.locations, `${n.id} 引用了未知地点`);
      if (c.fact === 'outcome') assert(['none', 'fulfilled', 'breached', 'not_triggered'].includes(c.value), `${n.id} 的结局无效`);
    }
    for (const c of n.choices) for (const e of c.effects) if (e.kind === 'flag') assert(p.manifest.declaredFlags.includes(e.key), `${n.id} 使用未声明标记 ${e.key}`);
  }
  unique(Object.values(p.art.assets).map(a => a.url), '图片发布路径');
  const tokens = JSON.stringify([p.story, p.locations, p.presentation]).matchAll(/\{\{([^{}]+)\}\}/g);
  for (const [, token] of tokens) assert(['player.name', 'primary.name', 'companion.name'].includes(token), `未知文本占位符 ${token}`);
  return p;
}
