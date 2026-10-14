/**
 * 库操作纯函数（v2 增量 4，无 Electron / DOM 依赖）。
 * 导入分类 / 合并 / 替换、分页、搜索、排序、删除影响计数，全部可 Node 直测。
 */
import { uid } from './profiles.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const normStr = (v) => (v == null ? '' : String(v).trim());
const normNum = (v) => (v === '' || v == null ? null : Number(v));

/** 视图行（经视图定义 getRows；返回副本，调用方不许原地改 profile）。 */
export function getViewRows(profile, view) {
  return view.getRows(profile);
}

/** 视图行写回（返回新 profile 对象；缺 id 的行补 id）。 */
export function setViewRows(profile, view, rows) {
  return view.setRows(profile, rows);
}

/** 业务主键拼接（仅用于导入分类；落库更新仍按 id 写回）。 */
export function businessKeyOf(view, row) {
  return (view.businessKey || []).map((f) => normStr(row?.[f])).join('\0');
}

/** 行校验：返回错误列表，空 = 合法。 */
export function validateRow(view, row) {
  const errors = [];
  for (const col of view.columns) {
    const v = row?.[col.key];
    if (col.required && normStr(v) === '') errors.push(`${col.label}必填`);
    if (col.type === 'number' && v !== '' && v != null && !Number.isFinite(Number(v))) {
      errors.push(`${col.label}不是有效数字`);
    }
    if (col.type === 'select' && v !== '' && v != null && !col.options.includes(v)) {
      errors.push(`${col.label}非法取值“${v}”`);
    }
    if (col.type === 'checkbox' && v != null && typeof v !== 'boolean') {
      errors.push(`${col.label}应为是/否`);
    }
  }
  return errors;
}

/**
 * 导入行归一化（落库/分类前调用）：费率行补 _section/_type/_key；
 * 规则视图行缺 kind 时补视图默认 kind（变体视图 → 变体，备选视图 → 备选），
 * 避免无 kind 的行写回后被视图过滤丢弃。
 */
export function normalizeImportedRows(view, rows) {
  return (rows || []).map((row) => {
    const r = { ...row };
    if (view.key === 'rulesVariant' && !r.kind) r.kind = '变体';
    if (view.key === 'rulesAlt' && !r.kind) r.kind = '备选';
    if (view.resolveRateIdentity) {
      const id = view.resolveRateIdentity(r);
      if (id) Object.assign(r, id);
    }
    return r;
  });
}

/**
 * 导入差异分类：对每行解析行按业务主键匹配现有库，分四组。
 * 费率视图的“数值”列为空（null）视为不参与 diff（保留旧值）。
 */
export function classifyImport(view, existingRows, incomingRows) {
  const added = [], updated = [], skipped = [], errors = [];
  const byKey = new Map();
  for (const r of existingRows || []) byKey.set(businessKeyOf(view, r), r);
  const seenInFile = new Set();
  for (const rawRow of incomingRows || []) {
    const row = rawRow;
    const key = businessKeyOf(view, row);
    const rowErrors = validateRow(view, row);
    if (view.resolveRateIdentity && !view.resolveRateIdentity(row)) {
      rowErrors.push(`未知费率项目“${row['费率项目'] ?? ''}”`);
    }
    if (seenInFile.has(key)) {
      errors.push({ key, row, errors: [...rowErrors, `文件内业务主键重复：${key.split('\0').join(' / ') || '(空)'}`] });
      continue;
    }
    seenInFile.add(key);
    if (rowErrors.length) { errors.push({ key, row, errors: rowErrors }); continue; }
    const existing = byKey.get(key);
    if (!existing) { added.push({ key, row }); continue; }
    const diffs = [];
    for (const col of view.columns) {
      if (col.type === 'readonly') continue;
      const from = existing[col.key];
      const to = row[col.key];
      if (col.type === 'number') {
        const fv = from === '' || from == null ? null : Number(from);
        const tv = to === '' || to == null ? null : Number(to);
        if (fv !== tv && !(fv == null && tv == null)) diffs.push({ field: col.key, label: col.label, from: fv, to: tv });
      } else if (normStr(from) !== normStr(to) && !(from == null && to == null)) {
        diffs.push({ field: col.key, label: col.label, from: from ?? '', to: to ?? '' });
      }
    }
    if (diffs.length) updated.push({ key, row, existing, diffs });
    else skipped.push({ key, row, existing });
  }
  return { added, updated, skipped, errors };
}

/**
 * 落库：按 decisions 执行合并 / 全部替换。
 * decisions: { mode: 'merge'|'replace', addedKeys: string[],
 *   updatedChoices: { [key]: { [field]: boolean } } }（updatedChoices 缺失的字段默认采用新值）。
 */
export function applyImport(view, existingRows, classification, decisions = {}) {
  const mode = decisions.mode || 'merge';
  const existing = clone(existingRows || []);
  if (mode === 'replace') {
    const byKey = new Map(existing.map((r) => [businessKeyOf(view, r), r]));
    const out = [];
    const seen = new Set();
    for (const item of [...classification.added, ...classification.updated]) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      const old = byKey.get(item.key);
      out.push({ ...clone(item.row), id: old?.id || item.row.id || uid() });
    }
    return out;
  }
  // merge
  const addedKeys = new Set(decisions.addedKeys ?? classification.added.map((a) => a.key));
  const next = existing;
  for (const a of classification.added) {
    if (!addedKeys.has(a.key)) continue;
    next.push({ ...clone(a.row), id: a.row.id || uid() });
  }
  const choices = decisions.updatedChoices || {};
  for (const u of classification.updated) {
    const target = next.find((r) => r.id === u.existing.id)
      || next.find((r) => businessKeyOf(view, r) === u.key);
    if (!target) continue;
    for (const d of u.diffs) {
      const take = choices[u.key]?.[d.field];
      if (take === false) continue;
      target[d.field] = u.row[d.field];
    }
  }
  return next;
}

/** 分页：返回当前页行 + 总数 + 显示范围（from/to，空表 0–0）+ 总页数 + 钳制后的页码。 */
export function paginate(rows, page, pageSize) {
  const total = (rows || []).length;
  const size = Math.max(1, pageSize || 50);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page || 1), totalPages);
  const from = total === 0 ? 0 : (p - 1) * size + 1;
  const to = Math.min(p * size, total);
  return { rows: (rows || []).slice((p - 1) * size, p * size), total, from, to, totalPages, page: p };
}

/** 分页条文案（B4 / §8.2）：`共 N 条，显示 M–K 条`。 */
export function formatPageRange(total, page, pageSize) {
  const { from, to } = paginate(Array.from({ length: total }), page, pageSize);
  return `共 ${total} 条，显示 ${from}–${to} 条`;
}

/** 搜索：对全部列的单元格字符串做包含匹配（大小写不敏感）。 */
export function filterRows(rows, columns, query) {
  const q = normStr(query).toLowerCase();
  if (!q) return rows || [];
  return (rows || []).filter((r) => (columns || []).some((c) => String(r?.[c.key] ?? '').toLowerCase().includes(q)));
}

/** 稳定排序：number 列数值比，其余字符串比；dir: 'asc' | 'desc'。 */
export function sortRows(rows, sortKey, dir, columns) {
  if (!sortKey) return rows || [];
  const col = (columns || []).find((c) => c.key === sortKey);
  const indexed = (rows || []).map((r, i) => ({ r, i }));
  indexed.sort((a, b) => {
    const av = a.r?.[sortKey], bv = b.r?.[sortKey];
    let cmp;
    if (col?.type === 'number') cmp = (Number(av) || 0) - (Number(bv) || 0);
    else cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'zh-CN');
    if (cmp === 0) cmp = a.i - b.i;
    return dir === 'desc' ? -cmp : cmp;
  });
  return indexed.map((x) => x.r);
}

/**
 * 删除影响计数（§8.4 影响说明用）。
 * 定额：引用该 code 的工程名 + 引用该 quota 的规则条数；
 * 材料：引用 (material, spec) 的规则条数；其余视图 0。
 */
export function countReferences(db, profile, view, rows) {
  const rowRefs = new Map();
  const projectNames = new Set();
  let rules = 0;
  const allRules = profile?.libraries?.rules || [];
  const projects = db?.projects || [];
  for (const row of rows || []) {
    let p = 0, r = 0;
    if (view.key === 'quotas') {
      for (const proj of projects) {
        if ((proj.quantities || []).some((q) => q.quota === row.code)) {
          p++; projectNames.add(proj.name || proj.id);
        }
      }
      r = allRules.filter((x) => x.quota === row.code).length;
    } else if (view.key === 'materials') {
      r = allRules.filter((x) => x.material === row.name && normStr(x.spec) === normStr(row.spec)).length;
    }
    rowRefs.set(row.id, { projects: p, rules: r });
    rules += r;
  }
  return { projects: [...projectNames], rules, rowRefs };
}

/** 数值归一化（供 excel 导入层复用）：空 → null，否则 Number。 */
export function toNumberOrNull(v) {
  return normNum(v);
}
