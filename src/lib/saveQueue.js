/**
 * 保存节流队列（v2 增量 5，B3，纯逻辑，无 React/Electron 依赖）。
 * 聚合 800ms 内的补丁，只发一次 db:savePatch；连续输入时最多每 delayMs 写一次盘。
 *
 * 合并规则（默认 merge）：patch 按分支 key 后写覆盖；baseVersion 取队列首个补丁的
 * 版本（最早）；major 取 OR（任一补丁 major 则本次保存触发滚动备份，§4.3）。
 * flush()：清定时器，取走当前待发送桶，调 saveFn；发送期间新 markDirty 进下一桶，
 * 本次 flush 循环继续发送下一桶，直到桶空。
 */
/**
 * v3.0 §13.7 完成通知：opts.onFlushStart() 在每次实际写盘前调用（App 置 saving）；
 * opts.onSettled({ source }) 在每次写盘桶完成后调用（App 据此置 saved / 已自动保存）。
 * source：'auto' = 800ms 定时触发；'manual' = 显式 flush({ source: 'manual' })（保存按钮/导出前排空）。
 */
export function createSaveQueue(saveFn, opts = {}) {
  const delayMs = opts.delayMs ?? 800;
  const setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout;
  const onFlushStart = opts.onFlushStart || null;
  const onSettled = opts.onSettled || null;
  const merge = opts.merge ?? ((acc, value) => ({
    patch: { ...(acc?.patch || {}), ...(value?.patch || {}) },
    baseVersion: acc ? acc.baseVersion : value?.baseVersion,
    major: !!(acc?.major || value?.major),
  }));

  let pending = null;
  let timer = null;
  let flushPromise = null;

  const schedule = () => {
    if (timer != null) return;
    timer = setTimeoutFn(() => {
      timer = null;
      void flush();
    }, delayMs);
  };
  const take = () => {
    const cur = pending;
    pending = null;
    return cur;
  };

  function markDirty(value) {
    if (!value || typeof value !== 'object') return;
    pending = merge(pending, value);
    schedule();
  }

  function flush(flushOpts = {}) {
    if (flushPromise) return flushPromise;
    const source = flushOpts.source || 'auto';
    flushPromise = (async () => {
      for (;;) {
        if (timer != null) { clearTimeoutFn(timer); timer = null; }
        const cur = take();
        if (!cur) break;
        if (onFlushStart) { try { onFlushStart({ source }); } catch { /* 通知回调异常不阻塞保存 */ } }
        try { await saveFn(cur); }
        finally {
          if (onSettled) { try { onSettled({ source }); } catch { /* 同上 */ } }
        }
      }
    })().finally(() => { flushPromise = null; });
    return flushPromise;
  }

  function pendingFn() {
    return pending != null || timer != null || flushPromise != null;
  }

  function cancel() {
    if (timer != null) { clearTimeoutFn(timer); timer = null; }
    pending = null;
  }

  return { markDirty, flush, pending: pendingFn, cancel };
}
