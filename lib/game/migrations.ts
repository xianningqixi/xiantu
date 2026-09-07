import { validateWorld } from './engine';
import { GameError } from './protocol';
import type { World } from './types';

/** Registered additive migration for the released xiantu-web-1 snapshot only.
 * Content/rules locks remain subject to validateWorld; this never blesses an unknown pack.
 */
export function migrateSave(value: unknown): { world: World; migrated: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GameError('SAVE_VERSION_UNSUPPORTED', '存档格式无法识别，原进度未改变。');
  }
  const copy = structuredClone(value) as World;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  if (version !== undefined && version !== 1 && version !== 2) {
    throw new GameError('SAVE_VERSION_UNSUPPORTED', '这是尚不支持的存档版本，请保留文件并使用对应版本打开。');
  }
  const migrated = version !== 2;
  if (migrated) {
    copy.schemaVersion = 2;
    // Old command IDs remain in appliedCommands and stay non-replayable when their
    // original payload is unknown. Do not invent receipts or delete old history.
    copy.commandReceipts = {};
  }
  validateWorld(copy);
  return { world: copy, migrated };
}
