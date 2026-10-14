/**
 * 撤销栈（v2 增量 4，B2，纯函数，无依赖）。
 * 只存数据快照（调用方构造），不存闭包；快照约定见 docs/v2-design.md 增量 4.3：
 *   { scope:'table', profileId, viewKey, rowsBefore } |
 *   { scope:'profiles', profilesBefore, settingsBefore }
 */
export function createUndoStack(limit = 50) {
  const stack = [];
  return {
    push(snapshot, label) {
      stack.push({ label: label || '操作', snapshot, at: new Date().toISOString() });
      while (stack.length > limit) stack.shift();
    },
    undo() {
      const item = stack.pop();
      return item || null;
    },
    canUndo() {
      return stack.length > 0;
    },
    size() {
      return stack.length;
    },
    peekLabel() {
      return stack.length ? stack[stack.length - 1].label : null;
    },
    clear() {
      stack.length = 0;
    },
  };
}
