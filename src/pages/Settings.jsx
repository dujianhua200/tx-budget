import { useState } from 'react';
import { LIBRARY_VIEWS, LIBRARY_VIEW_MAP } from '../lib/libraryDefs.js';
import {
  getViewRows, setViewRows, classifyImport, applyImport, countReferences, normalizeImportedRows,
} from '../lib/libraryOps.js';
import { DISCOUNT_LINE_DEFS } from '../engine/discount.mjs';
import LibraryTable from '../components/LibraryTable.jsx';
import ImportDiffPreview from '../components/ImportDiffPreview.jsx';

/**
 * 定制设置（v2 增量 4）：当前配置方案的库管理壳——方案选择器 + 11 个库 Tab
 * （复用 LibraryTable）+ 打折规则 Tab。配置方案的新建/复制/删除/导入导出在“配置方案”页。
 */
export default function Settings({ db, updateDb, pushUndo, notify }) {
  const [tab, setTab] = useState('quotas');
  const [importState, setImportState] = useState(null);

  const profile = db.configurationProfiles?.find((p) => p.id === db.settings?.activeProfileId)
    ?? db.configurationProfiles?.[0] ?? null;
  const view = LIBRARY_VIEW_MAP[tab] || null;
  const rows = view && profile ? getViewRows(profile, view) : [];

  const patchView = (v, fn, opts) => updateDb((d) => {
    const i = d.configurationProfiles.findIndex((p) => p.id === profile?.id);
    if (i < 0) return;
    d.configurationProfiles[i] = setViewRows(d.configurationProfiles[i], v, fn(getViewRows(d.configurationProfiles[i], v)));
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

  const patchDiscount = (fn) => updateDb((d) => {
    const prof = d.configurationProfiles?.find((p) => p.id === profile?.id);
    if (prof) { fn(prof.discountRule); prof.updatedAt = new Date().toISOString(); }
  });

  if (!profile) return <div className="empty">暂无配置方案，请到“配置方案”页新建。</div>;

  return (
    <div>
      <h2>定制设置 — 库管理</h2>
      <p className="muted">这里改的是当前配置方案（{profile.name}）的库：改完后该方案下所有工程重新计算；单个工程的特例（单价、调整量）请在工程内改，不会污染方案。配置方案的新建/复制/删除/导入导出在“配置方案”页。</p>
      <div className="toolbar">
        <label>配置方案 <select className="input" value={profile.id} onChange={(e) => updateDb((d) => { d.settings.activeProfileId = e.target.value; })}>
          {(db.configurationProfiles || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
      </div>
      <div className="tabs">
        {LIBRARY_VIEWS.map((v) => (
          <button key={v.key} className={tab === v.key ? 'tab active' : 'tab'} onClick={() => setTab(v.key)}>{v.label}</button>
        ))}
        <button className={tab === 'discount' ? 'tab active' : 'tab'} onClick={() => setTab('discount')}>打折规则</button>
      </div>

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

      {tab === 'discount' && (
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
