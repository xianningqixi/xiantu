import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../../content-packs/official-qingshi/manifest.json';
import story from '../../content-packs/official-qingshi/storylets.json';
import locations from '../../content-packs/official-qingshi/locations.json';
import characters from '../../content-packs/official-qingshi/characters.json';
import presentation from '../../content-packs/official-qingshi/presentation.json';
import art from '../../content-packs/official-qingshi/art/manifest.json';
import { validateContent } from '../../lib/game/content/contract.mjs';
import { CHARACTERS, STORY, PACK, visual, contentText } from '../../lib/game/content/official';
import { applyCommand, createWorld, scene, validateWorld } from '../../lib/game/engine';
import type { Profile, StoryNode } from '../../lib/game/types';

const fixture = () => structuredClone({ manifest, story, locations, characters, presentation, art });
const profile: Profile = { name: '玩家自选名', sex: 'male', aptitude: 60, artifact: 'focus', mode: 'simple', appearance: { face: 0, hair: 1, color: 2 } };

test('runtime reads the packaged JSON and resolves its scene and portrait references', () => {
  const w = createWorld(12345, profile, 'content-test');
  const n = scene(w)!;
  assert.equal(n.title, story.find(x => x.id === n.id)!.title);
  assert.equal(visual(n.visualId).url, art.assets['scene.market.dusk'].url);
  assert.equal(visual(n.portraitId!).url, art.assets['portrait.primary'].url);
  assert.equal(w.npcs[0].name, characters.primary.name);
  assert.equal(w.player.name, profile.name);
  assert.notEqual(w.player.id, PACK.roles.primary);
});

test('replacement prose, choice label, and visual reference work without engine edits', () => {
  const index = STORY.findIndex(n => n.id === 'first-meeting'); const original = STORY[index];
  try {
    STORY[index] = { ...original, body: '替换作者写的开场，{{player.name}}在此停步。', visualId: 'scene.ruins.moon', choices: original.choices.map(c => ({ ...c, label: '替换后的见礼选项' })) };
    const w = createWorld(12345, profile, 'replacement-test'); const n = scene(w)!;
    assert.equal(n.body, '替换作者写的开场，玩家自选名在此停步。');
    assert.equal(n.choices[0].label, '替换后的见礼选项');
    assert.equal(visual(n.visualId).url, art.assets['scene.ruins.moon'].url);
    const next = applyCommand(w, { type: 'choose', nodeId: n.id, choiceId: n.choices[0].id }, 'replacement-choice', 0);
    assert.equal(next.story.flags.met, true);
  } finally { STORY[index] = original; }
});

test('a new declared-flag storylet can appear, execute once, and leave the candidate set', () => {
  const flag = 'author_scene_seen';
  const n: StoryNode = { id: 'author-scene', title: '作者的新一幕', eyebrow: '闲谈', body: '同一个世界里的新故事。', portrait: false, visualId: 'scene.market.dusk', conditions: [{ fact: flag, op: 'eq', value: false }], choices: [{ id: 'finish', label: '记下此事', hint: '继续', reply: '此事已记下。', effects: [{ kind: 'flag', key: flag }] }] };
  const input = fixture(); input.manifest.declaredFlags.push(flag); input.story.unshift(n as typeof input.story[number]);
  assert.doesNotThrow(() => validateContent(input));
  PACK.declaredFlags.push(flag); STORY.unshift(n);
  try {
    const w = createWorld(12345, profile, 'extension-test'); assert.equal(scene(w)?.id, n.id);
    const next = applyCommand(w, { type: 'choose', nodeId: n.id, choiceId: 'finish' }, 'new-scene', 0);
    assert.equal(next.story.flags[flag], true); assert.notEqual(scene(next)?.id, n.id);
    assert.equal(applyCommand(next, { type: 'choose', nodeId: n.id, choiceId: 'finish' }, 'new-scene', 0), next);
  } finally { STORY.shift(); PACK.declaredFlags.pop(); }
});

test('duplicate IDs, unknown effects and invalid visual references are rejected', () => {
  const duplicate = fixture(); duplicate.story.push(duplicate.story[0]); assert.throws(() => validateContent(duplicate), /重复/);
  const unknown = fixture(); (unknown.story[0].choices[0].effects[0] as { kind: string }).kind = 'give_gold'; assert.throws(() => validateContent(unknown));
  const missing = fixture(); missing.story[0].visualId = 'missing.scene'; assert.throws(() => validateContent(missing), /视觉 ID/);
  const wrongKind = fixture(); wrongKind.story[0].visualId = 'portrait.primary'; assert.throws(() => validateContent(wrongKind), /视觉 ID/);
});

test('unavailable facts, unlisted flags, wrong value types and reserved shadowing are rejected', () => {
  const badFact = fixture(); badFact.story[0].conditions[0].fact = 'secret_gold'; assert.throws(() => validateContent(badFact), /条件事实/);
  const wrongType = fixture(); wrongType.story[0].conditions[0].value = 3; assert.throws(() => validateContent(wrongType), /条件事实/);
  const flag = fixture(); flag.story[0].choices[0].effects = [{ kind: 'flag', key: 'undeclared' }]; assert.throws(() => validateContent(flag), /未声明标记/);
  const shadow = fixture(); shadow.manifest.declaredFlags.push('primaryPresent'); assert.throws(() => validateContent(shadow), /保留事实/);
});

test('NPC binding cannot take player identity, and names come from the saved actors', () => {
  const invalid = fixture(); invalid.manifest.roles.primary = 'PLAYER'; invalid.characters.primary.id = 'PLAYER'; assert.throws(() => validateContent(invalid), /玩家身份/);
  const w = createWorld(12345, profile, 'identity-test'); w.npcs[0].name = '许知秋';
  assert.equal(contentText('{{player.name}}与{{primary.name}}相识。', w), '玩家自选名与许知秋相识。');
  assert.equal(CHARACTERS.primary.name, characters.primary.name);
});

test('path traversal, unknown text expressions and incompatible save locks fail clearly', () => {
  const invalid = fixture(); invalid.art.assets['scene.market.dusk'].file = 'art/images/../../secret.png'; assert.throws(() => validateContent(invalid));
  const expression = fixture(); expression.story[0].body = '{{process.env}}'; assert.throws(() => validateContent(expression), /未知文本占位符/);
  const w = createWorld(12345, profile, 'lock-test'); const before = structuredClone(w); w.packLock += '-different-content'; const incompatible = structuredClone(w);
  assert.throws(() => validateWorld(w), /内容版本不匹配/); assert.deepEqual(w, incompatible); assert.equal(before.player.name, w.player.name);
});
