"use client";
import { persistenceErrors } from "../ui/save-status";
import { uniqueId } from "./ids";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AdvanceProgress,
  BackupSummary,
  Command,
  CreationDraft,
  Profile,
  SaveExpectation,
  WorkerRequest,
  WorkerResponse,
  World,
} from "./types";

type Input = Omit<WorkerRequest, "id">;
type Waiter = {
  resolve: (r: WorkerResponse) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function useGame(preview = false) {
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<string, Waiter>());
  const [world, setWorld] = useState<World | null>(null);
  const [draft, setDraft] = useState<CreationDraft | null>(null);
  const draftRevision = useRef(0);
  const draftQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [lastResult, setLastResult] = useState<{
    id: string;
    kind: string;
    notice: string;
    day: number;
    revision: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [saveIssue, setSaveIssue] = useState("");
  const [progress, setProgress] = useState<AdvanceProgress | null>(null);
  const [advanceResult, setAdvanceResult] = useState<WorkerResponse["advanceResult"]>();
  const advancing = useRef<string | null>(null);
  const [recovery, setRecovery] = useState<SaveExpectation | null>(null);
  const [generation, setGeneration] = useState(0);
  const locked = useRef(false);
  const failedRequest = useRef<{ key: string; id: string; input: Input } | null>(null);

  const ask = useCallback(
    (input: Input, id = uniqueId()) =>
      new Promise<WorkerResponse>((resolve, reject) => {
        if (!worker.current) {
          reject(new Error("世界尚未准备好，请重新读取。"));
          return;
        }
        const timer = setTimeout(() => {
          pending.current.delete(id);
          reject(new Error("世界处理未及时返回，请重新读取以确认最新保存的进度。"));
        }, 15000);
        pending.current.set(id, { resolve, reject, timer });
        worker.current.postMessage({ ...input, protocolVersion: 1, id });
      }),
    [],
  );

  useEffect(() => {
    let active = true;
    setReady(false);
    let instance: Worker;
    const fail = (message: string) => {
      if (!active) return;
      setError(message);
      setErrorCode("WORKER_UNAVAILABLE");
      setSaveIssue("WORKER_UNAVAILABLE");
      setReady(true);
      locked.current = false;
      setBusy(false);
      for (const waiter of pending.current.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(message));
      }
      pending.current.clear();
    };
    try {
      instance = new Worker(new URL("./simulation.worker.ts", import.meta.url), {
        type: "module",
        name: preview ? "xiantu-author-preview" : "xiantu-game",
      });
    } catch {
      fail("世界进程未能启动，请重新读取；本机进度仍保留。");
      return;
    }
    worker.current = instance;
    instance.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (!active) return;
      const response = e.data;
      const waiter = pending.current.get(response.id);
      if (response.progress && waiter) {
        clearTimeout(waiter.timer);
        waiter.timer = setTimeout(() => {
          pending.current.delete(response.id);
          waiter.reject(new Error("推进未及时返回，请重新读取已保存的检查点。"));
        }, 15000);
        setProgress(response.progress);
        return;
      }
      pending.current.delete(response.id);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      if (response.ok) waiter.resolve(response);
      else
        waiter.reject(
          Object.assign(new Error(response.error || "操作失败。"), {
            code: response.code,
            state: response.state,
            recovery: response.recovery,
          }),
        );
    };
    instance.onerror = () => {
      worker.current = null;
      fail("世界加载遇到问题，请重新读取；已保存的进度会保留。");
    };
    instance.onmessageerror = () => fail("世界返回的数据无法读取，请重新读取。");
    Promise.all([ask({ kind: "load" }), ask({ kind: "loadDraft" })])
      .then(([saved, creation]) => {
        if (!active) return;
        setWorld(saved.state ?? null);
        if (saved.migrated && saved.state)
          setLastResult({
            id: saved.id,
            kind: "migration",
            notice: `旧档已迁移至规则 ${result.state.rulesVersion}，原始存档已保留备份。`,
            day: saved.state.day,
            revision: saved.state.revision,
          });
        setDraft(creation.draft ?? null);
        draftRevision.current = creation.draft?.revision ?? 0;
        setError("");
        setErrorCode("");
        setSaveIssue("");
        failedRequest.current = null;
        setRecovery(null);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setErrorCode(e.code || "WORKER_UNAVAILABLE");
          if (persistenceErrors.has(e.code || "WORKER_UNAVAILABLE"))
            setSaveIssue(e.code || "WORKER_UNAVAILABLE");
          if (e.recovery) setRecovery(e.recovery);
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      instance.terminate();
      worker.current = null;
      for (const waiter of pending.current.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("页面已关闭。"));
      }
      pending.current.clear();
    };
  }, [ask, generation, preview]);

  const mutate = useCallback(
    async (input: Input, checkpointId?: string) => {
      if (locked.current) return false;
      locked.current = true;
      setBusy(true);
      setError("");
      setErrorCode("");
      const key = JSON.stringify(input);
      const id =
        failedRequest.current?.key === key
          ? failedRequest.current.id
          : (checkpointId ?? uniqueId());
      if (input.kind === "advance") {
        advancing.current = id;
        setIsAdvancing(true);
        setAdvanceResult(undefined);
        setProgress(null);
      }
      try {
        const result = await ask(input, id);
        if (result.advanceResult) setAdvanceResult(result.advanceResult);
        if ("state" in result) {
          setWorld(result.state ?? null);
          setRecovery(null);
        }
        if (input.kind === "create") {
          setDraft(null);
          draftRevision.current = 0;
        }
        failedRequest.current = null;
        setSaveIssue("");
        if (result.state && input.kind !== "load")
          setLastResult({
            id,
            kind: input.kind,
            notice: ["restore", "import", "create"].includes(input.kind)
              ? `${input.kind === "restore" ? "已恢复" : input.kind === "import" ? "已导入" : "已创建"}${result.state.player.name}的这一世 · 第 ${result.state.day + 1} 日。${result.migrated ? `旧档已迁移至规则 ${result.state.rulesVersion}，原始存档已保留备份。` : input.kind === "import" ? `已读取 ${result.state.rulesVersion} 规则存档。` : ""}`
              : result.state.notice,
            day: result.state.day,
            revision: result.state.revision,
          });
        return true;
      } catch (e) {
        const code =
          e && typeof e === "object" && "code" in e ? String(e.code) : "SAVE_UNCONFIRMED";
        setErrorCode(code);
        if (
          persistenceErrors.has(code) &&
          (code !== "SAVE_VERSION_UNSUPPORTED" || input.kind === "load")
        )
          setSaveIssue(code);
        if (e && typeof e === "object" && "state" in e && e.state) setWorld(e.state as World);
        if (e && typeof e === "object" && "recovery" in e && e.recovery) {
          setRecovery(e.recovery as SaveExpectation);
          if (input.kind === "load") setWorld(null);
        }
        failedRequest.current = { key, id, input };
        setError(e instanceof Error ? e.message : "操作没有完成。");
        return false;
      } finally {
        if (input.kind === "advance") {
          advancing.current = null;
          setIsAdvancing(false);
          setProgress(null);
        }
        locked.current = false;
        setBusy(false);
      }
    },
    [ask],
  );
  const pauseAdvance = useCallback(() => {
    if (advancing.current)
      void ask({ kind: "pauseAdvance", advanceId: advancing.current }).catch(() => {});
  }, [ask]);
  const advance = useCallback(
    (days?: number) => {
      if (!world?.longAction) return Promise.resolve(false);
      return mutate({
        kind: "advance",
        actionId: world.longAction.id,
        checkpoint: world.longAction.checkpoint,
        days: Math.min(days ?? world.longAction.remaining, world.longAction.remaining),
        expected: { saveId: world.saveId, revision: world.revision },
      });
    },
    [world, mutate],
  );
  const expected: SaveExpectation = world
    ? { saveId: world.saveId, revision: world.revision }
    : (recovery ?? { saveId: null, revision: null });
  const command = useCallback(
    (command: Command) => {
      return mutate(
        {
          kind: "command",
          command,
          revision: world?.revision,
          expected: { saveId: world?.saveId ?? null, revision: world?.revision ?? null },
        },
        command.type === "step" && world?.longAction
          ? `${world.saveId}:${world.longAction.id}:step:${world.longAction.checkpoint + 1}`
          : undefined,
      );
    },
    [mutate, world],
  );
  const saveCreationDraft = useCallback(
    (value: Omit<CreationDraft, "revision" | "version">) => {
      const operation = draftQueue.current.then(async () => {
        const response = await ask({
          kind: "saveDraft",
          draft: { ...value, version: 1, revision: draftRevision.current },
        });
        draftRevision.current = response.draft!.revision;
        return response.draft!;
      });
      draftQueue.current = operation.catch(() => {});
      return operation;
    },
    [ask],
  );

  return {
    world,
    draft,
    ready,
    busy,
    error,
    errorCode,
    saveIssue,
    progress,
    isAdvancing,
    lastResult,
    advanceResult,
    retry: () => {
      const failed = failedRequest.current;
      return failed && ["SAVE_WRITE_FAILED", "SAVE_QUOTA_EXCEEDED"].includes(errorCode)
        ? mutate(failed.input, failed.id)
        : Promise.resolve(false);
    },
    canRetry:
      !!failedRequest.current && ["SAVE_WRITE_FAILED", "SAVE_QUOTA_EXCEEDED"].includes(errorCode),
    advance,
    pauseAdvance,
    setError: (message: string) => {
      if (saveIssue) return;
      setError(message);
      setErrorCode(message ? "FILE_ERROR" : "");
    },
    command,
    expected,
    saveCreationDraft,
    recovery,
    hasSavedRun: !!world || !!recovery,
    refreshDraft: async () => {
      const result = await ask({ kind: "loadDraft" });
      setDraft(result.draft ?? null);
      draftRevision.current = result.draft?.revision ?? 0;
    },
    create: (
      profile: Profile,
      seed: number,
      replace = false,
      snapshot = expected,
      contentLocks: string[] = [],
    ) => mutate({ kind: "create", profile, seed, replace, expected: snapshot, contentLocks }),
    importSave: (text: string, replace = false, snapshot = expected) =>
      mutate({ kind: "import", text, replace, expected: snapshot }),
    restoreBackup: (backupKey: string, snapshot = expected) =>
      mutate({ kind: "restore", backupKey, replace: true, expected: snapshot }),
    listBackups: async (): Promise<BackupSummary[]> =>
      (await ask({ kind: "backups" })).backups ?? [],
    exportBackup: async (backupKey: string) =>
      (await ask({ kind: "exportBackup", backupKey })).text,
    reload: async () => {
      if (!worker.current) {
        setGeneration((n) => n + 1);
        return false;
      }
      const result = await mutate({ kind: "load" });
      const creation = await ask({ kind: "loadDraft" }).catch(() => null);
      if (creation) {
        setDraft(creation.draft ?? null);
        draftRevision.current = creation.draft?.revision ?? 0;
      }
      return result;
    },
    exportSave: async () => {
      try {
        const result = await ask({ kind: "export", expected });
        if (result.error && !saveIssue) {
          setError(result.error);
          setErrorCode(result.code || "EXPORT_FAILED");
        }
        return result.text;
      } catch (e) {
        if (saveIssue) return undefined;
        setError(e instanceof Error ? e.message : "导出未完成。");
        setErrorCode(e && typeof e === "object" && "code" in e ? String(e.code) : "EXPORT_FAILED");
        return undefined;
      }
    },
  };
}
