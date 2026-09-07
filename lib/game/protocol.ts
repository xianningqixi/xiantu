import {negotiationCommandSchema} from './negotiation';
import balanceLimits from './content/balance.json';
import { z } from 'zod';
import type { Command, WorkerRequest } from './types';

const id = z.string().min(1).max(160);
const integer = z.number().int().safe().nonnegative();
export const profileSchema = z.object({
  name: z.string().max(16), sex: z.enum(['female', 'male']),
  aptitude: z.number().int().min(1).max(100), artifact: z.enum(['focus', 'ward', 'bond']),
  mode: z.enum(['simple', 'complex']),
  appearance: z.object({ face: z.number().int().min(0).max(3), hair: z.number().int().min(0).max(3), color: z.number().int().min(0).max(3) }).strict(),
}).strict();
const commandSchemas = [
  negotiationCommandSchema,
  z.object({ type: z.literal('chooseExtension'), nodeId: id, choiceId: id }).strict(),
  z.object({ type: z.literal('choose'), nodeId: id, choiceId: id }).strict(),
  z.object({ type: z.literal('travel'), to: z.enum(['market', 'inn', 'gate', 'ruins']) }).strict(),
  z.object({ type: z.literal('train'), days: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(30)]), stoneMethod: z.boolean() }).strict(),
  z.object({ type: z.literal('wait'), days: z.union([z.literal(1), z.literal(3), z.literal(7)]) }).strict(),
  ...(['step', 'stop', 'work', 'rest', 'learn', 'expedition', 'return', 'disband', 'compensate', 'exchange', 'heal', 'formParty', 'rally', 'resolveAgreement'] as const).map(type => z.object({ type: z.literal(type) }).strict()),
  z.object({ type: z.literal('meet'), target: id }).strict(),
  z.object({ type: z.literal('settle'), honor: z.boolean(), confirm: z.boolean() }).strict(),
  z.object({ type: z.literal('breakthrough'), usePill: z.boolean(), guardian: z.boolean() }).strict(),
  z.object({ type: z.literal('buy'), item: z.enum(['healing', 'pills', 'grass']) }).strict(),
  z.object({ type: z.literal('battle'), action: z.enum(['attack', 'skill', 'guard', 'heal', 'retreat']), target: id.optional() }).strict(),
  z.object({ type: z.literal('auto'), enabled: z.boolean() }).strict(),
] as const;
export const commandSchema = z.union(commandSchemas);
export const draftSchema = z.object({ version: z.literal(1), revision: integer, seed: integer.max(4294967295), roll: integer, profile: profileSchema, contentLocks: z.array(z.string().max(240)).max(10).optional() }).strict();
const expectedSchema = z.object({ saveId: id.nullable(), revision: integer.nullable() }).strict();
const envelope = { id, protocolVersion: z.literal(1).optional() };
const requestSchema = z.union([
  z.object({ ...envelope, kind: z.enum(['load', 'loadDraft', 'backups']) }).strict(),
  z.object({ ...envelope, kind: z.literal('saveDraft'), draft: draftSchema }).strict(),
  z.object({ ...envelope, kind: z.literal('create'), profile: profileSchema, seed: integer.max(4294967295), contentLocks: z.array(z.string().max(240)).max(10).optional(), replace: z.boolean().optional(), expected: expectedSchema }).strict(),
  z.object({ ...envelope, kind: z.literal('command'), command: commandSchema, revision: integer, expected: expectedSchema }).strict(),
  z.object({ ...envelope, kind: z.literal('import'), text: z.string().max(balanceLimits.limits.maxImportBytes), replace: z.boolean().optional(), expected: expectedSchema }).strict(),
  z.object({ ...envelope, kind: z.literal('export'), expected: expectedSchema }).strict(),
  z.object({ ...envelope, kind: z.literal('restore'), backupKey: id, replace: z.literal(true), expected: expectedSchema }).strict(),
  z.object({ ...envelope, kind: z.literal('exportBackup'), backupKey: id }).strict(),
]);

export class GameError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function parseRequest(value: unknown): WorkerRequest {
  const result = requestSchema.safeParse(value);
  if (!result.success) throw new GameError('VALIDATION_ERROR', '行动数据不完整或含不支持的字段，请重新读取后重试。');
  return result.data as WorkerRequest;
}
export function parseCommand(value: unknown): Command {
  const result = commandSchema.safeParse(value);
  if (!result.success) throw new GameError('VALIDATION_ERROR', '行动参数不合法，不会消耗时间或资源。');
  return result.data as Command;
}
/** Canonical payload only: transport identity and wall time are intentionally excluded. */
export function commandFingerprint(command: Command): string {
  const sorted = Object.fromEntries(Object.entries(command).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(sorted);
}
