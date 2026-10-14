/**
 * 工作台纯函数（v2 增量 5，无 React/Electron 依赖，可单测）。
 * 孤儿/无效/重复行状态、孤儿行删除、警告忽略、工程删除撤销快照恢复。
 */

/** 取 code === 'orphanQty' 的警告（引擎已返回，见 calc.mjs）。 */
export function orphanWarning(warnings) {
  return (warnings || []).find((w) => w?.code === 'orphanQty');
}

/** 取 code === 'invalidQty' 的警告。 */
export function invalidWarning(warnings) {
  return (warnings || []).find((w) => w?.code === 'invalidQty');
}

/** 取 orphanQty 警告的行 id 列表（无警告时 []）。 */
export function orphanRowIds(warnings) {
  const w = orphanWarning(warnings);
  return Array.isArray(w?.rowIds) ? [...w.rowIds] : [];
}

/** 取 invalidQty 警告的行 id 列表。 */
export function invalidRowIds(warnings) {
  const w = invalidWarning(warnings);
  return Array.isArray(w?.rowIds) ? [...w.rowIds] : [];
}

/** 返回库中出现 ≥2 次的定额 code 集合（B7 编号重复）。 */
export function duplicateCodes(quotas) {
  const seen = new Set();
  const dup = new Set();
  for (const q of quotas || []) {
    if (seen.has(q?.code)) dup.add(q.code);
    else seen.add(q?.code);
  }
  return dup;
}

/**
 * 行状态（优先级：孤儿 > 无效 > 重复，与 §10 B7 展示一致）。
 * @returns {'' | 'orphan' | 'invalid' | 'duplicate'}
 */
export function rowStatus(row, { orphanIds, invalidIds, dupCodes }) {
  if (orphanIds?.has(row?.id)) return 'orphan';
  if (invalidIds?.has(row?.id)) return 'invalid';
  if (dupCodes?.has(row?.quota)) return 'duplicate';
  return '';
}

/** 删除孤儿行：返回新 quantities 数组，不改原 project。 */
export function deleteOrphanRows(project, orphanIds) {
  const ids = orphanIds instanceof Set ? orphanIds : new Set(orphanIds || []);
  return (project?.quantities || []).filter((r) => !ids.has(r.id));
}

/** 忽略警告：返回新 warningsDismissed 数组（去重，不改原 project）。 */
export function dismissWarningCode(project, code) {
  const cur = project?.warningsDismissed || [];
  if (cur.includes(code)) return [...cur];
  return [...cur, code];
}

/**
 * 恢复工程删除撤销快照（就地改 draft，返回是否处理）。
 * scope 'project'：写回单个工程（不存在时插入顶部，存在时原位替换）。
 * scope 'projects'：整数组写回。
 */
export function restoreProjectSnapshot(draft, snapshot) {
  if (!snapshot || !draft) return false;
  if (snapshot.scope === 'project') {
    const before = snapshot.projectBefore;
    if (!before || !before.id) return false;
    if (!Array.isArray(draft.projects)) draft.projects = [];
    const i = draft.projects.findIndex((p) => p.id === before.id);
    if (i >= 0) draft.projects[i] = JSON.parse(JSON.stringify(before));
    else draft.projects.unshift(JSON.parse(JSON.stringify(before)));
    return true;
  }
  if (snapshot.scope === 'projects') {
    if (!Array.isArray(snapshot.projectsBefore)) return false;
    draft.projects = JSON.parse(JSON.stringify(snapshot.projectsBefore));
    return true;
  }
  return false;
}
