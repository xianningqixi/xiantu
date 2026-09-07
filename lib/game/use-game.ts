"use client";
import { uniqueId } from './ids';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BackupSummary, Command, CreationDraft, Profile, SaveExpectation, WorkerRequest, WorkerResponse, World } from './types';

type Input = Omit<WorkerRequest, 'id'>;
type Waiter = { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export function useGame() {
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<string, Waiter>());
  const [world, setWorld] = useState<World | null>(null);
  const [draft, setDraft] = useState<CreationDraft | null>(null);
  const draftRevision = useRef(0);
  const draftQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<SaveExpectation | null>(null);
  const [generation, setGeneration] = useState(0);
  const locked = useRef(false);
  const lastCommand = useRef({ key: '', at: 0 });
  const failedRequest = useRef<{ key: string; id: string } | null>(null);

  const ask = useCallback((input: Input, id = uniqueId()) => new Promise<WorkerResponse>((resolve, reject) => {
    if (!worker.current) { reject(new Error('世界尚未准备好，请重新读取。')); return; }
    const timer = setTimeout(() => {
      pending.current.delete(id);
      reject(new Error('世界处理未及时返回，请重新读取以确认最新保存的进度。'));
    }, 15000);
    pending.current.set(id, { resolve, reject, timer });
    worker.current.postMessage({ ...input, protocolVersion: 1, id });
  }), []);

  useEffect(() => {
    let active = true;
    setReady(false);
    let instance: Worker;
    const fail = (message: string) => {
      if (!active) return;
      setError(message); setReady(true); locked.current = false; setBusy(false);
      for (const waiter of pending.current.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(message)); }
      pending.current.clear();
    };
    try { instance = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }); }
    catch { fail('世界进程未能启动，请重新读取；本机进度仍保留。'); return; }
    worker.current = instance;
    instance.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (!active) return;
      const response = e.data;
      const waiter = pending.current.get(response.id);
      pending.current.delete(response.id);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      if (response.ok) waiter.resolve(response);
      else waiter.reject(Object.assign(new Error(response.error || '操作失败。'), { code: response.code, recovery: response.recovery }));
    };
    instance.onerror = () => { worker.current = null; fail('世界加载遇到问题，请重新读取；已保存的进度会保留。'); };
    instance.onmessageerror = () => fail('世界返回的数据无法读取，请重新读取。');
    Promise.all([ask({ kind: 'load' }), ask({ kind: 'loadDraft' })]).then(([saved, creation]) => {
      if (!active) return;
      setWorld(saved.state ?? null); setDraft(creation.draft ?? null);
      draftRevision.current = creation.draft?.revision ?? 0;
      setError(''); setRecovery(null);
    }).catch(e => { if (active) { setError(e.message); if (e.recovery) setRecovery(e.recovery); } }).finally(() => { if (active) setReady(true); });
    return () => {
      active = false; instance.terminate(); worker.current = null;
      for (const waiter of pending.current.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('页面已关闭。')); }
      pending.current.clear();
    };
  }, [ask, generation]);

  const mutate = useCallback(async (input: Input) => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError('');
    const key = JSON.stringify(input);
    const id = failedRequest.current?.key === key ? failedRequest.current.id : uniqueId();
    try {
      const result = await ask(input, id);
      if ('state' in result) { setWorld(result.state ?? null); setRecovery(null); }
      if (input.kind === 'create') { setDraft(null); draftRevision.current = 0; }
      failedRequest.current = null;
      return true;
    } catch (e) {
      if (e && typeof e === 'object' && 'recovery' in e && e.recovery) setRecovery(e.recovery as SaveExpectation);
      failedRequest.current = { key, id };
      setError(e instanceof Error ? e.message : '操作没有完成。'); return false;
    } finally { locked.current = false; setBusy(false); }
  }, [ask]);
  const expected: SaveExpectation = world ? { saveId: world.saveId, revision: world.revision } : recovery ?? { saveId: null, revision: null };
  const command = useCallback((command: Command) => {
    const key = JSON.stringify(command); const now = Date.now();
    if (command.type !== 'step' && lastCommand.current.key === key && now - lastCommand.current.at < 400) return Promise.resolve(false);
    lastCommand.current = { key, at: now };
    return mutate({ kind: 'command', command, revision: world?.revision, expected: { saveId: world?.saveId ?? null, revision: world?.revision ?? null } });
  }, [mutate, world?.saveId, world?.revision]);
  const saveCreationDraft = useCallback((value: Omit<CreationDraft, 'revision' | 'version'>) => {
    const operation = draftQueue.current.then(async () => {
      const response = await ask({ kind: 'saveDraft', draft: { ...value, version: 1, revision: draftRevision.current } });
      draftRevision.current = response.draft!.revision;
      return response.draft!;
    });
    draftQueue.current = operation.catch(() => {});
    return operation;
  }, [ask]);

  return {
    world, draft, ready, busy, error, setError, command, expected, saveCreationDraft, recovery, hasSavedRun: !!world || !!recovery,
    refreshDraft: async () => { const result = await ask({ kind: 'loadDraft' }); setDraft(result.draft ?? null); draftRevision.current = result.draft?.revision ?? 0; },
    create: (profile: Profile, seed: number, replace = false, snapshot = expected) => mutate({ kind: 'create', profile, seed, replace, expected: snapshot }),
    importSave: (text: string, replace = false, snapshot = expected) => mutate({ kind: 'import', text, replace, expected: snapshot }),
    restoreBackup: (backupKey: string, snapshot = expected) => mutate({ kind: 'restore', backupKey, replace: true, expected: snapshot }),
    listBackups: async (): Promise<BackupSummary[]> => (await ask({ kind: 'backups' })).backups ?? [],
    exportBackup: async (backupKey: string) => (await ask({ kind: 'exportBackup', backupKey })).text,
    reload: async () => {
      if (!worker.current) { setGeneration(n => n + 1); return false; }
      const result = await mutate({ kind: 'load' });
      const creation = await ask({ kind: 'loadDraft' }).catch(() => null);
      if (creation) { setDraft(creation.draft ?? null); draftRevision.current = creation.draft?.revision ?? 0; }
      return result;
    },
    exportSave: async () => {
      try {
        const result = await ask({ kind: 'export', expected });
        if (result.error) setError(result.error);
        return result.text;
      } catch (e) { setError(e instanceof Error ? e.message : '导出未完成。'); return undefined; }
    },
  };
}
