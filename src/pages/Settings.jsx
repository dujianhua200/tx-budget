import { useState } from 'react';
import { LIBRARY_VIEW_MAP } from '../lib/libraryDefs.js';
import {
  getViewRows, setViewRows, classifyImport, applyImport, countReferences, normalizeImportedRows,
} from '../lib/libraryOps.js';
import { DISCOUNT_LINE_DEFS } from '../engine/discount.mjs';
import { PROJECT_TYPES } from '../lib/store.js';
import { resolveEditingProfile } from '../lib/v3.js';
import LibraryTable from '../components/LibraryTable.jsx';
import ImportDiffPreview from '../components/ImportDiffPreview.jsx';
import FeeTreeTable from '../components/FeeTreeTable.jsx';
import { calcFor } from '../lib/store.js';

/**
 * 定制设置（v3.0 §13.8 / §13.11.2）：编辑目标 = settings.editingProfileId，不碰 activeProfileId。
 * section/tab 由 App 导航传入：libraries（库表）/ feeRules（费率左树+右表 / 表五费用 / 打折规则 / 关联规则）
 * / settings（整库备份 / 导入导出）。
 */
export default function Settings({ db, updateDb, pushUndo, notify, section, tab }) {
  const [importState, setImportState] = useState(null);
  const [feeProjectType, setFeeProjectType] = useState('通信线路工程');

  const profile = resolveEditingProfile(db);
  // 取费左树右表需要一个计算结果做金额列：用首个使用该方案的工程，无则用空工程占位（金额为空）。
  const feeExampleProject = (db.projects || []).find((p) => p.profileId === profile?.id)
    || { id: 'fee-preview', name: '预览', profileId: profile?.id, info: { 工程类型: feeProjectType }, quantities: [], materialAdjust: [], materialPriceOverrides: [], ruleOverrides: [], rateOverrides: {}, table5Overrides: [] };
  let feeResult = null;
  try { feeResult = profile ? calcFor(db, feeExampleProject) : null; } catch { feeResult = null; }

  const viewKey = section === 'libraries' ? tab : (section === 'feeRules' && (tab === 'table5fees' || tab === 'rulesAlt') ? tab : null);
  const view = viewKey ? LIBRARY_VIEW_MAP[viewKey] : null;
  const rows = view && profile ? getViewRows(profile, view) : [];

  const patchProfile = (fn, opts) => updateDb((d) => {
    const i = d.configurationProfiles.findIndex((p) => p.id === profile?.id);
    if (i < 0) return;
    fn(d.configurationProfiles[i]);
    d.configurationProfiles[i].updatedAt = new Date().toISOString();
  }, opts);
  const patchView = (v, fn, opts) => patchProfile((prof) => {
    const next = setViewRows(prof, v, fn(getViewRows(prof, v)));
    Object.assign(prof, next);
  }, opts);

  const handleEdit = (id, patch) => patchView(view, (rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const handleAdd = () => patchView(view, (rs) => [view.newRow(), ...rs]);
  const handleDelete = (ids) => {
    pushUndo({ scope: 'table', profileId: profile.id, viewKey: view.key, rowsBefore: rows }, `删除 ${ids.length} 条${view.label}`);
    patchView(view, (rs) => rs.filter((r) => !ids.includes(r.id)), { major: true });
    notify(`已删除 ${ids.length} 条${view.label}，可撤销`, { undo: true });
  };
  const handleImport = async () => {
    const file = await window.api.openFile([{ name: 'Excel', extensions: ['xlsx', 'xls'] }]);
    if (!file) return;
    let res;
    try {
      res = await window.api.importLibrary({ filePath: file, kind: view.key });
    } catch (e) {
      alert(`导入解析失败：${e.message}`);
      return;
    }
    if (!res.rows?.length && res.errors?.length) {
      alert(`导入解析失败：\n${res.errors.join('\n')}`);
      return;
    }
    const normalized = normalizeImportedRows(view, res.rows || []);
    const classification = classifyImport(view, rows, normalized);
    setImportState({ view, classification, parseErrors: res.errors || [], rowsBefore: rows });
  };
  const confirmImport = (decisions) => {
    const { view: v, classification, rowsBefore } = importState;
    const nextRows = applyImport(v, rowsBefore, classification, decisions);
    pushUndo({ scope: 'table', profileId: profile.id, viewKey: v.key, rowsBefore }, `导入${v.label}（${decisions.mode === 'replace' ? '全部替换' : '合并'}）`);
    patchView(v, () => nextRows, { major: decisions.mode === 'replace' });
    setImportState(null);
    notify(`导入完成：${v.label} 现 ${nextRows.length} 条`, { undo: false });
  };
  const handleExport = async (format, scope, exportRows) => {
    const ext = format === 'json' ? 'json' : 'xlsx';
    const file = await window.api.saveFile({
      defaultPath: `${view.label}.${ext}`,
      filters: [{ name: format === 'json' ? 'JSON' : 'Excel', extensions: [ext] }],
    });
    if (!file) return;
    try {
      await window.api.exportLibrary({ filePath: file, kind: view.key, rows: exportRows });
      notify(`已导出：${file}`, { undo: false });
    } catch (e) {
      alert(`导出失败：${e.message}`);
    }
  };

  const patchDiscount = (fn) => patchProfile((prof) => { fn(prof.discountRule); });
  /** 费率右表编辑：写回编辑方案 rates.byProjectType[工程类型][字段]，走 savePatch。 */
  const handleRateChange = (key, rateField, value) => patchProfile((prof) => {
    if (!prof.rates) prof.rates = { byProjectType: {}, winterTable: {}, vatRates: {} };
    if (!prof.rates.byProjectType) prof.rates.byProjectType = {};
    if (!prof.rates.byProjectType[feeProjectType]) prof.rates.byProjectType[feeProjectType] = {};
    prof.rates.byProjectType[feeProjectType][rateField] = value;
  });

  if (!profile) return <div className="empty">暂无配置方案，请到“配置方案”页新建。</div>;

  if (section === 'settings') {
    return (
      <div>
        <h2>设置</h2>
        <p className="muted">整库备份 / 导入导出（全部走主进程写真实路径）。</p>
        <div className="row">
          <button className="btn" onClick={async () => {
            const file = await window.api.saveFile({ defaultPath: '概预算整库备份.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
            if (!file) return;
            const res = await window.api.exportBackup({ filePath: file });
            if (res?.ok) notify(`整库已备份：${res.filePath}`, { undo: false });
            else alert(`备份失败：${res?.error || '未知错误'}`);
          }}>整库备份</button>
          <button className="btn" onClick={async () => {
            const file = await window.api.openFile([{ name: 'JSON', extensions: ['json'] }]);
            if (!file) return;
            const res = await window.api.importProfile({ filePath: file });
            if (res?.ok) notify(`已导入配置方案“${res.profile.name}”`, { undo: false });
            else alert(`导入失败：${res?.error || '未知错误'}`);
          }}>导入方案文件</button>
          <button className="btn" onClick={async () => {
            const file = await window.api.saveFile({ defaultPath: `${profile.name}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
            if (!file) return;
            const res = await window.api.exportProfile({ profileId: profile.id, filePath: file });
            if (res?.ok) notify(`已导出：${res.filePath}`, { undo: false });
            else alert(`导出失败：${res?.error || '未知错误'}`);
          }}>导出正在编辑的方案</button>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>正在编辑方案：{profile.name}（编辑目标）；新建工程默认方案：{(db.configurationProfiles || []).find((p) => p.id === db.settings?.activeProfileId)?.name || '—'}（两者分离，见 §13.8）。</p>
      </div>
    );
  }

  return (
    <div>
      <h2>{section === 'libraries' ? '基础库' : '取费规则'} <span className="muted">— 正在编辑方案：{profile.name}</span></h2>
      <p className="muted">这里改的是编辑目标方案（{profile.name}）的库/费率：改完后该方案下所有工程重新计算；单个工程的特例（单价、调整量）请在工程内改，不会污染方案。新建工程默认方案不受这里影响（到“配置方案”页设为默认）。</p>

      {section === 'feeRules' && tab === 'rates' && (
        <div>
          <div className="toolbar">
            <label>工程类别 <select className="input" value={feeProjectType} onChange={(e) => setFeeProjectType(e.target.value)}>
              {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>
            <span className="muted">金额列取自{feeExampleProject.id === 'fee-preview' ? '空工程预览（金额为空）' : `工程“${feeExampleProject.name}”`}的折前表二。</span>
          </div>
          <FeeTreeTable profile={profile} result={feeResult} projectType={feeProjectType} onRateChange={handleRateChange} />
        </div>
      )}

      {view && (
        <LibraryTable
          view={view}
          rows={rows}
          referenceInfo={(targets) => countReferences(db, profile, view, targets)}
          onEdit={handleEdit}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onImport={handleImport}
          onExport={handleExport}
        />
      )}

      {section === 'feeRules' && tab === 'discount' && (
        <div>
          <p className="muted">打折规则随配置方案保存与导出（§6）。折扣率 1 = 不打折；勾选的费用项不打折（折后 = 折前）；勾选“折后=0”的费用项在打折时折后为 0（折扣率 = 1 时不生效）；同一项不可同时勾选两列。</p>
          <div className="row">
            <label>折扣率 <input className="input" type="number" step="any" style={{ width: 120 }} value={profile.discountRule?.discountRate ?? 1} onChange={(e) => patchDiscount((r) => { r.discountRate = Number(e.target.value); })} /></label>
            <span className="muted">当前：{((profile.discountRule?.discountRate ?? 1) * 100).toFixed(1)}%</span>
          </div>
          <table className="table"><thead><tr><th>不打折费用项</th><th>折后=0</th><th>说明</th></tr></thead>
            <tbody>{DISCOUNT_LINE_DEFS.filter((d) => d.kind === 'leaf').map((d) => {
              const keys = profile.discountRule?.noDiscountKeys || [];
              const checked = keys.includes(d.key);
              const zeroKeys = profile.discountRule?.zeroAfterDiscountKeys || [];
              const zeroChecked = zeroKeys.includes(d.key);
              return (
                <tr key={d.key}><td>
                  <label><input type="checkbox" checked={checked} onChange={(e) => patchDiscount((r) => {
                    const set = new Set(r.noDiscountKeys || []);
                    if (e.target.checked) {
                      set.add(d.key);
                      const z = new Set(r.zeroAfterDiscountKeys || []);
                      z.delete(d.key);
                      r.zeroAfterDiscountKeys = [...z];
                    } else set.delete(d.key);
                    r.noDiscountKeys = [...set];
                  })} /> {d.label}</label>
                </td><td>
                  <label><input type="checkbox" checked={zeroChecked} onChange={(e) => patchDiscount((r) => {
                    const z = new Set(r.zeroAfterDiscountKeys || []);
                    if (e.target.checked) {
                      z.add(d.key);
                      const set = new Set(r.noDiscountKeys || []);
                      set.delete(d.key);
                      r.noDiscountKeys = [...set];
                    } else z.delete(d.key);
                    r.zeroAfterDiscountKeys = [...z];
                  })} /></label>
                </td><td className="muted">{d.methodBefore}</td></tr>
              );
            })}</tbody></table>
        </div>
      )}

      {importState && (
        <ImportDiffPreview
          open
          viewLabel={importState.view.label}
          profileName={profile.name}
          classification={importState.classification}
          parseErrors={importState.parseErrors}
          allowReplace={importState.view.key !== 'rates'}
          onCancel={() => setImportState(null)}
          onConfirm={confirmImport}
        />
      )}
    </div>
  );
}
