import type { SaveExpectation, World } from './types';

export function assertSaveExpectation(current: World | null, expected?: SaveExpectation) {
  if (!expected || (current?.saveId ?? null) !== expected.saveId || (current?.revision ?? null) !== expected.revision) {
    throw new Error('另一页面已更新或切换角色，原进度未改变。请重新读取后再操作。');
  }
}
