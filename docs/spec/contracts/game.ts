/** V0.1.1 contract draft; data definitions, not an implemented game engine. */
export type Id = string;
export type Int = number; // Runtime: Number.isSafeInteger. TypeScript alone cannot enforce bounds.
export type BasisPoints = Int; // 0..10000
export type RealmTier = 0 | 1 | 2;
export type RunMode = 'simple' | 'complex';
export type RngStream = 'worldgen' | 'creation' | 'simulation' | 'combat' | 'narrative';
export interface RngState { algorithm: 'xorshift32-v1'; state: Int; drawCount: Int }
export interface Versions {
  saveSchema: 1; generator: string; rules: 'prototype-0.1.1';
  content: string; assets: string; rng: 'xorshift32-v1';
}
export type LocationRef =
  | { kind: 'at'; locationId: Id }
  | { kind: 'travel'; fromId: Id; toId: Id; arrivalDay: Int; actionId: Id };
export interface CultivationState {
  realmTier: RealmTier; layer: Int; progress: Int; learnedManualIds: Id[];
}
export interface CharacterState {
  id: Id; name: string; gender: 'male' | 'female'; bornDay: Int; personalityId: Id;
  appearanceId: Id; alive: boolean; deathEventId: Id | null;
  aptitude: Int; cultivation: CultivationState; hp: Int; injury: Int;
  location: LocationRef; factionId: Id | null; goalIds: Id[];
  occupiedByActionId: Id | null; lastConsumedActionDay: Int | null;
}
export interface PlayerProfile {
  characterId: 'PLAYER'; name: string; gender: 'male' | 'female';
  appearanceId: Id; aptitude: Int; rerollCount: Int;
  artifactId: 'ARTIFACT_FOCUS' | 'ARTIFACT_WARD' | 'ARTIFACT_BOND'; mode: RunMode;
}
export interface CreationDraft { draftId: Id; worldSeed: Int; profile: Partial<PlayerProfile>; creationRng: RngState }
export interface Relationship {
  fromId: Id; toId: Id; favor: Int; trust: Int; attraction: Int;
  labels: string[]; causeEventIds: Id[];
}
export interface WorldEvent {
  id: Id; day: Int; sequence: Int; type: string; actorIds: Id[];
  locationId: Id | null; causeId: Id; payload: Record<string, unknown>;
}
export interface Memory {
  id: Id; observerId: Id; eventId: Id; learnedDay: Int;
  source: 'participant' | 'witness' | 'report'; sourceActorId: Id | null; important: boolean;
}
export type AgreementStatus = 'draft' | 'accepted' | 'active' | 'fulfilled' | 'breached' | 'not_triggered' | 'impossible' | 'cancelled';
export type AgreementTerm =
  | { type: 'first_matching_loot'; itemId: Id; quantity: 1; recipientId: Id }
  | { type: 'remaining_loot'; recipientId: Id }
  | { type: 'upfront_fee'; itemId: 'ITEM_SPIRIT_STONE'; quantity: Int; payerId: Id; recipientId: Id; trigger: 'expedition_start' };
export interface Agreement {
  id: Id; scopeId: Id; revision: Int; status: AgreementStatus;
  participantIds: Id[]; terms: AgreementTerm[]; acceptedByIds: Id[];
  expeditionId: Id | null; settlementEventId: Id | null;
}
export interface InventoryEntry { id: Id; ownerId: Id; itemId: Id; quantity: Int; reservedByActionId: Id | null }
export interface LootEntry { id: Id; itemId: Id; quantity: Int; allocatedToId: Id | null }
export interface PartyState { id: Id; leaderId: 'PLAYER'; memberIds: Id[]; agreementId: Id | null; occupiedByActionId: Id | null }
export interface ExpeditionState {
  id: Id; scopeId: Id; partyId: Id; agreementId: Id;
  phase: 'ready' | 'active' | 'resolved' | 'settled';
  entryLocationId: Id; loot: LootEntry[]; feePaymentEventId: Id | null;
  battleId: Id | null; resolutionEventId: Id | null; settlementEventId: Id | null;
}
export interface LongAction {
  id: Id; kind: 'training' | 'breakthrough' | 'travel' | 'work' | 'rest' | 'wait' | 'expedition_entry';
  actorIds: Id[]; startDay: Int; remainingDays: Int; lastCommittedStep: Int;
  preparationEventId: Id | null; input: Record<string, unknown>;
  status: 'active' | 'paused_computation' | 'completed' | 'stopped';
}
export interface BattleState {
  id: Id; expeditionId: Id | null; round: Int; actorQueue: Id[];
  phase: 'awaiting_player' | 'resolving_round' | 'finished';
  allies: Id[]; enemies: Id[]; participantHp: Record<Id, Int>;
  autoPlayer: boolean; outcome: 'victory' | 'defeat' | 'retreat' | null;
}
export interface StoryScope {
  id: Id; agreementId: Id | null; partyId: Id | null; expeditionId: Id | null;
  facts: Record<string, boolean | string | Int>; claimKeys: string[];
  lastSettlementDay: Int | null; finalized: boolean;
}
export interface InteractionSession {
  id: Id; storyletId: Id; scopeId: Id; participantIds: Id[];
  renderedBody: string; renderedChoiceIds: Id[]; basedOnRevision: Int;
  status: 'open' | 'completed';
}
export interface WorldState {
  seed: Int; day: Int; playerId: 'PLAYER'; runStatus: 'active' | 'ended';
  profile: PlayerProfile; characters: Record<Id, CharacterState>;
  locations: Record<Id, { id: Id; neighborIds: Id[] }>;
  factionIds: Id[]; inventories: InventoryEntry[];
  relationships: Relationship[]; agreements: Record<Id, Agreement>;
  parties: Record<Id, PartyState>; expeditions: Record<Id, ExpeditionState>;
  storyScopes: Record<Id, StoryScope>; longActions: Record<Id, LongAction>;
  battles: Record<Id, BattleState>; interaction: InteractionSession | null;
  rng: Record<RngStream, RngState>; nextEventSequence: Int;
}
export interface SaveEnvelope { saveId: Id; revision: Int; versions: Versions; contentHash: string; world: WorldState }

export type CommandType =
  | 'FinalizeCreateRun' | 'Talk' | 'ClaimStarterManual' | 'Work' | 'Rest' | 'Wait' | 'BuyItem' | 'ExchangePill'
  | 'AdvanceDialogue' | 'LeaveInteraction' | 'StartTraining' | 'StartBreakthrough'
  | 'Travel' | 'ProposeAgreement' | 'AcceptAgreement' | 'FormParty' | 'StartExpedition'
  | 'AllocateLoot' | 'CompensateAgreement' | 'DisbandParty' | 'BattleAction' | 'SetAutoBattle' | 'StopLongAction'
  | 'RunCheckpoint';
export interface CommandEnvelope {
  protocolVersion: 1; requestId: Id; saveId: Id; commandId: Id;
  expectedRevision: Int; type: CommandType;
  source?: { sessionId: Id; storyletId: Id; choiceId: Id };
  args: Record<string, unknown>; // Must validate against the per-command catalog before execution.
}
export type ErrorCode = 'VALIDATION_ERROR' | 'PRECONDITION_FAILED' | 'STALE_REVISION' |
  'COMMAND_ID_REUSE' | 'SAVE_WRITE_FAILED' | 'SAVE_VERSION_UNSUPPORTED' |
  'SAVE_MIGRATION_BLOCKED' | 'CONTENT_MISSING' | 'AI_UNAVAILABLE' |
  'AI_INVALID_PROPOSAL' | 'RUN_ENDED';
export type CommandReply =
  | { status: 'committed'; commandId: Id; revision: Int; eventIds: Id[]; view: SceneViewModel }
  | { status: 'rejected'; commandId: Id; code: ErrorCode; message: string; currentRevision: Int };
export interface CommandRecord { commandId: Id; payloadHash: string; committedRevision: Int; reply: CommandReply }
export interface JournalEntry { id: Id; day: Int; body: string; eventIds: Id[]; assetIds: Id[] }
export interface PortableSave {
  format: 'xiuxian-portable-v1'; envelope: SaveEnvelope;
  events: WorldEvent[]; memories: Memory[]; journals: JournalEntry[];
  commandRecords: CommandRecord[];
}
export interface ProgressMessage { actionId: Id; computingDay: Int; savedDay: Int; committedStep: Int; remainingDays: Int }

export type ConditionKind = 'entity' | 'fact' | 'agreement' | 'party' | 'expedition' | 'clock';
export type ConditionValue = string | number | boolean | string[] | { ruleRef: string };
export interface Condition { kind: ConditionKind; subjectId: Id; key: string; op: 'eq' | 'ne' | 'gte' | 'in' | 'contains'; value: ConditionValue }
export interface StoryChoice {
  id: Id; label: string; commandType: CommandType | 'OpenProfile';
  args: Record<string, unknown>; conditions: Condition[]; nextStoryletId?: Id;
}
export interface StoryletDefinition {
  id: Id; title: string; locationId: Id; participantIds: Id[];
  backgroundAssetId: Id; portraitAssetIds: Id[]; body: string;
  conditions: Condition[]; choices: StoryChoice[]; once: boolean; cooldownDays: Int;
}
export interface AssetDefinition {
  id: Id; kind: string; status: 'planned' | 'ready';
  filePath: string | null; alt: string; entityId: Id | null;
  locationId: Id | null; expression: string | null; targetAspectRatio: string;
  style: string; cropSafeArea: string; sourceStatus: string; rightsStatus: string;
}
export interface SceneViewModel {
  revision: Int; sessionId: Id | null; locationName: string; day: Int;
  title: string; body: string; backgroundAssetId: Id; portraitAssetIds: Id[];
  choices: { id: Id; label: string; enabled: boolean; reason: string | null }[];
  summary: string[];
}
export interface NegotiationProposal {
  intent: 'invite' | 'counter_offer' | 'accept' | 'reject';
  npcId: Id; scopeId: Id; terms: AgreementTerm[]; unresolvedTerms: string[]; reason: string;
}
