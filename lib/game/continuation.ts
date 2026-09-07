/** Cancel only UI continuation; an already committed game command remains saved. */
export function createContinuationGuard() {
  let generation = 0;
  return {
    cancel() { generation++; },
    async run(action: () => Promise<boolean>, onSuccess: () => void) {
      const started = generation;
      const ok = await action();
      if (ok && started === generation) onSuccess();
      return ok;
    },
  };
}
