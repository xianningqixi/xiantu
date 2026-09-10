/// <reference lib="webworker" />
import { knownEvents } from "./knowledge";
import { legacyRealmIndex } from "./rules";
import { advanceStopReason } from "./advance";
import balanceLimits from "./content/balance.json";
import { uniqueId } from "./ids";
import { assertSaveExpectation } from "./save-guard";
import { applyCommand, createWorld } from "./engine";
import { migrateSave } from "./migrations";
import { withCampaignContent } from "./campaign-content";
import { GameError, parseRequest } from "./protocol";
import type { BackupSummary, CreationDraft, WorkerRequest, WorkerResponse, World } from "./types";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const DB_VERSION = 3;
const preview = scope.name === "xiantu-author-preview";
const newSaveId = () => `${preview ? "preview:" : ""}${uniqueId()}`;
const MAX_BYTES = balanceLimits.limits.maxImportBytes;
const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(preview ? "xiantu-author-preview" : "xiantu-qingshi", DB_VERSION);
    } catch {
      reject(
        new GameError("SAVE_WRITE_FAILED", "无法打开本机存档，请检查浏览器是否允许网站存储。"),
      );
      return;
    }
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["saves", "backups", "drafts", "backupMeta"]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    request.onblocked = () => {
      blocked = true;
      reject(
        new GameError(
          "SAVE_MIGRATION_BLOCKED",
          "另一旧页面正在使用存档，请关闭旧页面后重新读取。原进度保留。",
        ),
      );
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) {
        db.close();
        return;
      }
      resolve(db);
    };
    request.onerror = () =>
      reject(
        new GameError("SAVE_WRITE_FAILED", "无法打开本机存档，请检查浏览器是否允许网站存储。"),
      );
  });

function read<T>(db: IDBDatabase, store: string, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = tx.objectStore(store).get(key);
    tx.oncomplete = () => resolve(request.result ?? null);
    tx.onabort = () => reject(new GameError("SAVE_WRITE_FAILED", "读取存档未完成，请重试。"));
    tx.onerror = () => {};
  });
}

// Identity, backup and pointer update commit together; request success is not an ack.
function commit(
  db: IDBDatabase,
  next: World,
  expected: World | null,
  backup = false,
  clearDraft = false,
  reason: NonNullable<BackupSummary["reason"]> = "migration",
  importedOriginal?: World,
) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["saves", "backups", "drafts", "backupMeta"], "readwrite");
    const saves = tx.objectStore("saves");
    const query = saves.get("current");
    let problem: GameError | undefined;
    query.onsuccess = () => {
      try {
        const current = query.result as World | undefined;
        if (
          (current?.saveId ?? null) !== (expected?.saveId ?? null) ||
          (current?.revision ?? null) !== (expected?.revision ?? null)
        ) {
          problem = new GameError(
            "STALE_REVISION",
            "另一页面已更新或切换角色，原进度未改变。请重新读取后再操作。",
          );
          tx.abort();
          return;
        }
        if (backup && current) {
          const key = `${current.saveId}:${current.revision}`;
          tx.objectStore("backups").put(current, key);
          tx.objectStore("backupMeta").put({ createdAt: Date.now(), reason }, key);
        }
        if (importedOriginal) {
          const key = `migration-import:${importedOriginal.saveId}:${importedOriginal.revision}`;
          tx.objectStore("backups").put(importedOriginal, key);
          tx.objectStore("backupMeta").put({ reason: "migration" }, key);
        }
        saves.put(next, "current");
        if (clearDraft) tx.objectStore("drafts").delete("current");
      } catch (error) {
        problem = new GameError(
          error &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "QuotaExceededError"
            ? "SAVE_QUOTA_EXCEEDED"
            : "SAVE_WRITE_FAILED",
          error &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "QuotaExceededError"
            ? "本机存储空间不足，行动未保存。请先导出进度、释放空间，再重试。"
            : "保存未完成。本次行动没有写入，请重试。",
        );
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(
        problem ??
          new GameError(
            tx.error?.name === "QuotaExceededError" ? "SAVE_QUOTA_EXCEEDED" : "SAVE_WRITE_FAILED",
            tx.error?.name === "QuotaExceededError"
              ? "本机存储空间不足，行动未保存。请先导出进度、释放空间，再重试。"
              : "保存未完成。本次行动没有写入，请保留页面并重试。",
          ),
      );
    tx.onerror = () => {};
  });
}

function saveDraft(db: IDBDatabase, draft: CreationDraft) {
  return new Promise<CreationDraft>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    const query = store.get("current");
    let next: CreationDraft;
    let stale = false;
    query.onsuccess = () => {
      const current = query.result as CreationDraft | undefined;
      if ((current?.revision ?? 0) !== draft.revision) {
        stale = true;
        tx.abort();
        return;
      }
      next = { ...draft, revision: draft.revision + 1 };
      try {
        store.put(next, "current");
      } catch {
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () =>
      reject(
        new GameError(
          stale ? "STALE_REVISION" : "SAVE_WRITE_FAILED",
          stale ? "另一页面已修改创角草稿，请重新读取后继续。" : "草稿尚未保存，请保留页面并重试。",
        ),
      );
    tx.onerror = () => {};
  });
}

function listBackups(db: IDBDatabase) {
  return new Promise<BackupSummary[]>((resolve, reject) => {
    const tx = db.transaction(["backups", "backupMeta"], "readonly");
    const store = tx.objectStore("backups");
    const keys = store.getAllKeys();
    const values = store.getAll();
    const metaKeys = tx.objectStore("backupMeta").getAllKeys();
    const metaValues = tx.objectStore("backupMeta").getAll();
    tx.oncomplete = () =>
      resolve(
        values.result
          .map((w, i) => ({
            ...(metaValues.result[metaKeys.result.indexOf(keys.result[i])] ?? {}),
            mode: w?.profile?.mode,
            realm:
              w?.rulesVersion === "0.2.0" ? w?.player?.realm : legacyRealmIndex(w?.player?.realm),
            key: String(keys.result[i]),
            name: w?.profile?.name ?? "旧存档",
            day: w?.day ?? 0,
            revision: w?.revision ?? 0,
          }))
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.revision - a.revision),
      );
    tx.onabort = () => reject(new GameError("SAVE_WRITE_FAILED", "备份列表读取失败，请重试。"));
    tx.onerror = () => {};
  });
}

const advances = new Map<string, { cancelled: boolean }>();
async function advanceBatch(
  db: IDBDatabase,
  request: WorkerRequest,
  raw: World | null,
): Promise<WorkerResponse> {
  if (!raw || raw.saveId !== request.expected?.saveId)
    throw new GameError("STALE_REVISION", "角色已经变化，请重新读取。");
  let { world, migrated } = migrateSave(raw);
  const stepId = (checkpoint: number) => `${world.saveId}:${request.actionId}:step:${checkpoint}`;
  // Lost transport acknowledgments never start another action, even after completion.
  if (!world.longAction || world.longAction.id !== request.actionId) {
    if (world.appliedCommands.includes(stepId(request.checkpoint! + 1)))
      return { id: request.id, ok: true, state: world };
    throw new GameError("STALE_REVISION", "修行已经变化，请重新读取当前进度。");
  }
  if (world.longAction.checkpoint < request.checkpoint!)
    throw new GameError("STALE_REVISION", "检查点尚未保存，请重新读取。");
  if (world.longAction.checkpoint === request.checkpoint!)
    assertSaveExpectation(raw, request.expected);
  if (migrated) {
    world.revision++;
    await commit(db, world, raw, true);
  }
  const startDay = world.day - world.longAction!.checkpoint;
  let reason: "paused" | "completed" | "condition" = "paused";
  try {
    for (
      let i = 0;
      i < request.days! &&
      world.longAction !== null &&
      world.longAction.id === request.actionId &&
      world.longAction.checkpoint < request.checkpoint! + request.days!;
      i++
    ) {
      if (advances.get(request.id)?.cancelled) break;
      const action = world.longAction;
      const previousEventCount = world.events.length;
      const next = applyCommand(
        world,
        { type: "step" },
        stepId(action.checkpoint + 1),
        world.revision,
      );
      await commit(db, next, world);
      world = next;
      const completed = action.checkpoint + 1;
      const knownIds = new Set(knownEvents(world).map((e) => e.id));
      scope.postMessage({
        id: request.id,
        ok: true,
        progress: {
          newEventIds: world.events
            .slice(previousEventCount)
            .filter((e) => e.day === world.day && knownIds.has(e.id))
            .map((e) => e.id),
          actionId: action.id,
          completed,
          total: action.total,
          day: world.day,
          paidStones:
            world.longAction?.paidStones ??
            action.paidStones +
              (action.stoneMethod
                ? balanceLimits.cultivation.methods.METHOD_SPIRIT_STONE.costSpiritStonesPerDay
                : 0),
        },
      } satisfies WorkerResponse);
      if (!world.longAction) reason = completed < action.total ? "condition" : "completed";
      else if (
        action.stopWhen?.kind === "importantEvent" &&
        advanceStopReason(world, action.stopWhen, world.day - 1)
      ) {
        reason = "condition";
        break;
      }
    }
    return {
      id: request.id,
      ok: true,
      state: world,
      advanceResult: { startDay, endDay: world.day, reason },
    };
  } catch (error) {
    // Return only the last durable checkpoint. The failed candidate is never published.
    return {
      id: request.id,
      ok: false,
      state: world,
      code: error instanceof GameError ? error.code : "SAVE_WRITE_FAILED",
      error: error instanceof Error ? error.message : "推进未保存，请重新读取后继续。",
    };
  }
}

async function process(request: WorkerRequest): Promise<WorkerResponse> {
  const db = await openDb();
  try {
    if (request.kind === "loadDraft")
      return {
        id: request.id,
        ok: true,
        draft: await read<CreationDraft>(db, "drafts", "current"),
      };
    if (request.kind === "saveDraft")
      return { id: request.id, ok: true, draft: await saveDraft(db, request.draft!) };
    if (request.kind === "backups")
      return { id: request.id, ok: true, backups: await listBackups(db) };
    if (request.kind === "exportBackup") {
      const backup = await read<World>(db, "backups", request.backupKey!);
      if (!backup) throw new GameError("VALIDATION_ERROR", "这份备份不存在。");
      return { id: request.id, ok: true, text: JSON.stringify(backup, null, 2) };
    }
    const raw = await read<World>(db, "saves", "current");
    if (request.kind === "advance") return await advanceBatch(db, request, raw);
    if (request.kind === "load") {
      if (!raw) return { id: request.id, ok: true, state: null };
      try {
        const { world, migrated } = migrateSave(raw);
        if (migrated) {
          world.revision++;
          await commit(db, world, raw, true);
        }
        return { id: request.id, ok: true, state: world, migrated };
      } catch (error) {
        return {
          id: request.id,
          ok: false,
          code: error instanceof GameError ? error.code : "SAVE_VERSION_UNSUPPORTED",
          error: `${error instanceof Error ? error.message : "存档无法读取。"} 可先导出原始进度或从本机备份恢复。`,
          recovery: { saveId: raw.saveId, revision: raw.revision },
        };
      }
    }
    // Lost-ack retry: the original command may be replayed only on the same save.
    if (
      request.kind === "command" &&
      raw &&
      request.expected?.saveId === raw.saveId &&
      raw.appliedCommands.includes(request.id)
    ) {
      const { world, migrated } = migrateSave(raw);
      if (migrated) {
        world.revision++;
        await commit(db, world, raw, true);
      }
      return {
        id: request.id,
        ok: true,
        state: applyCommand(world, request.command!, request.id, request.revision!),
      };
    }
    assertSaveExpectation(raw, request.expected);
    if (request.kind === "export") {
      if (!raw) throw new GameError("PRECONDITION_FAILED", "尚无可导出的存档。");
      const text = JSON.stringify(raw);
      return {
        id: request.id,
        ok: true,
        text,
        ...(new TextEncoder().encode(text).length > MAX_BYTES
          ? {
              code: "EXPORT_TOO_LARGE",
              error:
                "完整备份已导出，但超过当前 16 MiB 导入上限。请保留文件，并联系开发者调整导入上限。",
            }
          : {}),
      };
    }
    let importedOriginal: World | undefined;
    let next: World;
    let migrated = false;
    if (request.kind === "create") {
      if (raw && !request.replace)
        throw new GameError("PRECONDITION_FAILED", "已有一段人生，请先确认开始新局。");
      next = createWorld(request.seed!, request.profile!, newSaveId(), undefined, {
        contentLocks: withCampaignContent(request.contentLocks),
      });
    } else if (request.kind === "import" || request.kind === "restore") {
      if (raw && !request.replace)
        throw new GameError("PRECONDITION_FAILED", "导入会替换当前进度，请先确认。");
      let value: unknown;
      if (request.kind === "restore") value = await read(db, "backups", request.backupKey!);
      else {
        if (new TextEncoder().encode(request.text!).length > MAX_BYTES)
          throw new GameError("VALIDATION_ERROR", "存档超过 16 MiB。");
        try {
          value = JSON.parse(request.text!);
        } catch {
          throw new GameError("VALIDATION_ERROR", "存档 JSON 无法解析。原进度未改变。");
        }
      }
      ({ world: next, migrated } = migrateSave(value));
      if (migrated) importedOriginal = value as World;
      if (!preview && next.saveId.startsWith("preview:"))
        throw new GameError("VALIDATION_ERROR", "作者预览存档只能导入作者预览页面。");
      next.saveId = newSaveId();
      next.revision++;
    } else {
      if (!raw) throw new GameError("PRECONDITION_FAILED", "请先创建或读取角色。");
      const result = migrateSave(raw);
      migrated = result.migrated;
      next = applyCommand(result.world, request.command!, request.id, request.revision!);
    }
    await commit(
      db,
      next,
      raw,
      request.kind !== "command" || migrated,
      request.kind === "create",
      request.kind === "create" || request.kind === "import" || request.kind === "restore"
        ? request.kind
        : "migration",
      importedOriginal,
    );
    return { id: request.id, ok: true, state: next, migrated };
  } finally {
    db.close();
  }
}

let queue = Promise.resolve();
scope.onmessage = (event: MessageEvent<unknown>) => {
  const data = event.data;
  const id =
    data && typeof data === "object" && typeof (data as { id?: unknown }).id === "string"
      ? (data as { id: string }).id
      : "invalid-request";
  let request: WorkerRequest;
  try {
    request = parseRequest(data);
  } catch (error) {
    scope.postMessage({
      id,
      ok: false,
      code: error instanceof GameError ? error.code : "VALIDATION_ERROR",
      error: error instanceof Error ? error.message : "行动数据不合法。",
    } satisfies WorkerResponse);
    return;
  }
  if (request.kind === "pauseAdvance") {
    const control = advances.get(request.advanceId!);
    if (control) control.cancelled = true;
    scope.postMessage({ id, ok: true } satisfies WorkerResponse);
    return;
  }
  if (request.kind === "advance") advances.set(id, { cancelled: false });
  queue = queue.then(async () => {
    try {
      scope.postMessage(await process(request));
    } catch (error) {
      scope.postMessage({
        id,
        ok: false,
        code: error instanceof GameError ? error.code : "PRECONDITION_FAILED",
        error: error instanceof Error ? error.message : "操作未完成，请重试。",
      } satisfies WorkerResponse);
    } finally {
      advances.delete(id);
    }
  });
};
