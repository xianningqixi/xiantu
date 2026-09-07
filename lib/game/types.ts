export type LocationId = 'market' | 'inn' | 'gate' | 'ruins';
export type Artifact = 'focus' | 'ward' | 'bond';
export interface Profile { name: string; sex: 'female' | 'male'; aptitude: number; artifact: Artifact; mode: 'simple' | 'complex'; appearance: { face: number; hair: number; color: number }; }
export interface Actor {
  id: string; name: string; sex: 'female' | 'male'; ageDays: number; appearanceSeed: number;
  aptitude: number; personality: string; sect: string; goal: string; realm: number; xp: number;
  hp: number; stones: number; healing: number; pills: number; grass: number; manual: boolean;
  alive: boolean; location: LocationId; activity: string; readyDay: number;
  attempt: { remaining: number; chance: number } | null;
}
export interface Relation { from: string; to: string; favor: number; trust: number; attraction: number; known: boolean; memories: string[]; }
export interface WorldEvent { id: string; day: number; kind: string; text: string; actors: string[]; public: boolean; }
export interface StoryState { flags: Record<string, boolean>; outcome: 'none' | 'fulfilled' | 'breached' | 'not_triggered'; settledDay: number | null; compensated: boolean; }
export interface Agreement { id: string; status: 'accepted' | 'active' | 'fulfilled' | 'breached' | 'not_triggered' | 'cancelled'; members: string[]; recipient: string; expeditionId: string | null; strict: boolean; meeting?: { location: LocationId }; }
export interface Fighter { id: string; name: string; hp: number; maxHp: number; attack: number; defense: number; speed: number; guard: boolean; cooldown: number; }
export interface Battle { id: string; round: number; allies: Fighter[]; enemies: Fighter[]; logs: string[]; auto: boolean; }
export interface LongAction { kind: 'train' | 'wait' | 'breakthrough'; total: number; remaining: number; stoneMethod: boolean; chance: number; guardian: string | null; }
export interface World {
  format: 'xiantu-web-1'; rulesVersion: '0.1.1'; packLock: string; saveId: string; revision: number;
  seed: number; day: number; profile: Profile; player: Actor; npcs: Actor[];
  rng: Record<'simulation' | 'combat', number>; relations: Relation[]; events: WorldEvent[];
  story: StoryState; agreement: Agreement | null; party: string[]; battle: Battle | null;
  loot: { stones: number; grass: number; expeditionId: string } | null;
  longAction: LongAction | null; lastExpeditionDay: number; ended: boolean; notice: string;
  appliedCommands: string[];
}
export type Command =
  | { type: 'choose'; nodeId: string; choiceId: string }
  | { type: 'travel'; to: LocationId }
  | { type: 'train'; days: number; stoneMethod: boolean }
  | { type: 'wait'; days: number }
  | { type: 'step' }
  | { type: 'stop' }
  | { type: 'work' | 'rest' | 'learn' | 'expedition' | 'return' | 'disband' | 'compensate' | 'exchange' | 'heal' }
  | { type: 'meet'; target: string }
  | { type: 'formParty' | 'rally' }
  | { type: 'settle'; honor: boolean; confirm: boolean }
  | { type: 'breakthrough'; usePill: boolean; guardian: boolean }
  | { type: 'buy'; item: 'healing' | 'pills' | 'grass' }
  | { type: 'battle'; action: 'attack' | 'skill' | 'guard' | 'heal' | 'retreat'; target?: string }
  | { type: 'auto'; enabled: boolean };
export interface Condition { fact: string; op: 'eq' | 'gte'; value: string | number | boolean; }
export interface StoryEffect { kind: 'meet' | 'learn' | 'flag' | 'agreement'; key?: string; target?: string; }
export interface Choice { id: string; label: string; hint: string; effects: StoryEffect[]; reply: string; }
export interface StoryNode { id: string; title: string; eyebrow: string; body: string; quote?: string; conditions: Condition[]; choices: Choice[]; portrait: boolean; visualId: string; portraitId?: string; }
export interface SaveExpectation { saveId: string | null; revision: number | null; }
export interface WorkerRequest { id: string; kind: 'load' | 'create' | 'command' | 'import' | 'export'; revision?: number; expected?: SaveExpectation; profile?: Profile; seed?: number; command?: Command; text?: string; replace?: boolean; }
export interface WorkerResponse { id: string; ok: boolean; state?: World | null; error?: string; text?: string; }
