import { useMemo, useState } from 'react';
import { calcFor, money, num2, getLibraries, uid } from '../lib/store.js';
import { getProfile } from '../lib/profiles.js';
import { resolveExportSelection } from '../lib/v3.js';
import {
  orphanWarning, invalidWarning, orphanRowIds, invalidRowIds,
  duplicateCodes, rowStatus, deleteOrphanRows, dismissWarningCode,
} from '../lib/workbench.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ExportPicker from '../components/ExportPicker.jsx';
import WorkbenchInfo from '../components/workbench/WorkbenchInfo.jsx';
import WorkbenchQuantities from '../components/workbench/WorkbenchQuantities.jsx';
import { WorkbenchMaterials, WorkbenchEquip, WorkbenchMachines, WorkbenchInstruments, WorkbenchFee, WorkbenchTable5 } from '../components/workbench/WorkbenchTables.jsx';

/**
 * 单工程工作台（v3.0 §13.3/§13.4）：编排器 + 共享数据。
 * 一次只显示一个功能（tab 由 App 导航传入）；各标签共享同一 project / result 引用，保证数据一致。
 * tab: info | workload-3a | workload-4a | workload-equip | workload-3b | workload-3c | fee | table5 | export
 */
export default function Workbench({ db, project, updateDb, back, pushUndo, notify, flushSaves, tab }) {
  const [table2Mode, setTable2Mode] = useState('after');
  const [confirm, setConfirm] = useState(null);
  const [exportSelection, setExportSelection] = useState(() => resolveExportSelection(db.settings));

  const { result, calcError } = useMemo(() => {
    try { return { result: calcFor(db, project), calcError: null }; }
    catch (e) { return { result: null, calcError: e.message || String(e) }; }
  }, [db, project]);

  const profile = getProfile(db, project.profileId);
  const libs = getLibraries(db, project);
  const warnings = result?.warnings || [];
  const orphanIds = useMemo(() => new Set(orphanRowIds(warnings)), [warnings]);
  const invalidIds = useMemo(() => new Set(invalidRowIds(warnings)), [warnings]);
  const dupCodes = useMemo(() => duplicateCodes(libs.quotas), [libs.quotas]);
  const dismissed = project.warningsDismissed || [];
  const orphanWarn = orphanWarning(warnings);
  const invalidWarn = invalidWarning(warnings);
  const orphanCount = orphanIds.size;
  const orphanCodes = [...new Set(project.quantities.filter((r) => orphanIds.has(r.id)).map((r) => r.quota))];
  const otherWarnings = warnings.filter((w) => w.code !== 'orphanQty' && w.code !== 'invalidQty');

  const patch = (fn) => updateDb((d) => {
    const p = d.projects.find((x) => x.id === project.id);
    if (p) { fn(p); p.updatedAt = new Date().toISOString(); }
  });
  const snapshotProject = (label) => {
    if (pushUndo) pushUndo({ scope: 'project', projectId: project.id, projectBefore: JSON.parse(JSON.stringify(project)) }, label);
  };
  const setInfo = (k, v) => patch((p) => { p.info[k] = v; });
  const setName = (v) => patch((p) => { p.name = v; });
  const setQty = (id, field, v) => patch((p) => { const row = p.quantities.find((x) => x.id === id); if (row) row[field] = v; });
  const addQtyRow = (row) => patch((p) => {
    p.quantities.push({ id: uid(), quota: row.code, variant: row.name, unit: row.unit, qty: row.qty ?? 0, coef: row.coef ?? 1 });
  });
  const setDelta = (key, v) => patch((p) => {
    const ex = p.materialAdjust.find((a) => a.key === key);
    if (ex) ex.delta = v; else p.materialAdjust.push({ key, delta: v });
  });
  const setPrice = (key, v) => patch((p) => {
    const ex = p.materialPriceOverrides.find((a) => a.key === key);
    if (ex) ex.priceExcl = v; else p.materialPriceOverrides.push({ key, priceExcl: v });
  });
  const toggleRule = (ruleId, enabled) => patch((p) => {
    const ex = p.ruleOverrides.find((a) => a.ruleId === ruleId);
    if (ex) ex.enabled = enabled; else p.ruleOverrides.push({ ruleId, enabled });
  });
  const setRateOverride = (key, v) => patch((p) => {
    p.rateOverrides = p.rateOverrides || {};
    if (v === '' || v == null) p.rateOverrides[key] = null;
    else p.rateOverrides[key] = Number(v);
  });
  const setTable5Override = (key, field, v) => patch((p) => {
    const ex = (p.table5Overrides || []).find((o) => o.key === key);
    if (ex) ex[field] = v;
    else p.table5Overrides.push({ key, amount: field === 'amount' ? v : null, enabled: field === 'enabled' ? v : null });
  });
  const dismissWarning = (code) => patch((p) => { p.warningsDismissed = dismissWarningCode(p, code); });

  const doDeleteQty = (row) => {
    snapshotProject(`删除工程量行“${row.quota} ${row.variant}”`);
    patch((p) => { p.quantities = p.quantities.filter((x) => x.id !== row.id); });
    setConfirm(null);
    if (notify) notify('已删除工程量行，可撤销', { undo: true });
  };
  const doDeleteOrphans = () => {
    snapshotProject(`删除 ${orphanCount} 行孤儿工程量`);
    patch((p) => { p.quantities = deleteOrphanRows(p, orphanIds); });
    setConfirm(null);
    if (notify) notify(`已删除 ${orphanCount} 行孤儿工程量，可撤销`, { undo: true });
  };
  const doSwitchProfile = (targetId, targetName) => {
    snapshotProject(`切换配置方案为“${targetName}”`);
    patch((p) => { p.profileId = targetId; });
    setConfirm(null);
    if (notify) notify(`已切换到配置方案“${targetName}”，结果已重新计算`, { undo: true });
  };
  const locateOrphan = () => {
    const first = project.quantities.find((r) => orphanIds.has(r.id));
    if (first) document.getElementById(`qty-row-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const doExport = async (selection) => {
    setConfirm(null);
    try {
      // 导出勾选持久化到 settings.exportSelection（下次默认用上次选择）。
      updateDb((d) => { d.settings.exportSelection = [...selection]; });
      if (flushSaves) await flushSaves();
      const file = await window.api.saveFile({ defaultPath: `${project.name}_概预算.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (!file) return;
      const freshResult = calcFor(db, project);
      await window.api.exportBudgetBook({ filePath: file, project, result: freshResult, profileId: project.profileId, include: selection });
      if (notify) notify(`已导出：${file}`, { undo: false });
    } catch (e) {
      if (notify) notify(`导出失败：${e.message}`, { undo: false });
    }
  };
  const exportOne = (selection) => {
    if (orphanCount > 0) {
      setConfirm({
        kind: 'export',
        title: '仍有孤儿工程量行，确认导出？',
        impact: `有 ${orphanCount} 行工程量引用了库中不存在的定额编号，将不参与计算。\n编号：${orphanCodes.join('、')}\n导出时这些行按“定额编号列写“不取费”、工日列为空”原样呈现（§11）。`,
        confirmLabel: '确认导出',
        selection,
      });
      return;
    }
    void doExport(selection);
  };

  const confirmProps = (() => {
    if (!confirm) return null;
    if (confirm.kind === 'delQty') {
      return {
        title: '删除该工程量行？',
        impact: `定额编号：${confirm.row.quota}\n项目名称：${confirm.row.variant}\n数量：${confirm.row.qty}`,
        confirmLabel: '删除',
        onConfirm: () => doDeleteQty(confirm.row),
      };
    }
    if (confirm.kind === 'delOrphans') {
      return {
        title: `删除 ${orphanCount} 行孤儿工程量？`,
        impact: `以下编号在当前配置方案的定额库中不存在，将不参与计算：\n${orphanCodes.join('、')}\n删除后可撤销。`,
        samples: orphanCodes,
        confirmLabel: '删除孤儿行',
        onConfirm: doDeleteOrphans,
      };
    }
    if (confirm.kind === 'switchProfile') {
      return {
        title: '切换配置方案？',
        impact: `将从“${profile?.name ?? '—'}”切换到“${confirm.targetName}”。\n切换配置将重新计算，结果可能变化。`,
        confirmLabel: '确认切换',
        onConfirm: () => doSwitchProfile(confirm.targetId, confirm.targetName),
      };
    }
    if (confirm.kind === 'export') {
      return {
        title: confirm.title, impact: confirm.impact, confirmLabel: confirm.confirmLabel,
        onConfirm: () => void doExport(confirm.selection),
      };
    }
    return null;
  })();

  const deltaOf = (key) => project.materialAdjust.find((a) => a.key === key)?.delta ?? 0;
  const priceOf = (key, def) => project.materialPriceOverrides.find((a) => a.key === key)?.priceExcl ?? def;

  return (
    <div>
      <div className="toolbar">
        <button className="btn" onClick={back}>← 返回工程列表</button>
        <b style={{ fontSize: 18 }}>{project.name}</b>
        <span className="muted">配置方案：{profile?.name ?? '—'}</span>
        <span className="muted">总计（含税）{result ? money(result.table1.grandIncl) : '—'} 元</span>
        <span className="muted">工日 {result ? `${num2(result.techDays)} / ${num2(result.laborDays)}` : '—'}</span>
      </div>
      {calcError && <div className="wb-warn"><span>计算失败：{calcError}</span></div>}
      {!!otherWarnings.length && <p className="muted">其他警告：{otherWarnings.map((w) => w.message).join('；')}</p>}

      {tab === 'info' && (
        <WorkbenchInfo db={db} project={project} profile={profile} setInfo={setInfo} setName={setName}
          setRateOverride={setRateOverride} setTable5Override={setTable5Override}
          onSwitchProfile={(id, name) => setConfirm({ kind: 'switchProfile', targetId: id, targetName: name })} />
      )}
      {tab === 'workload-3a' && (
        <WorkbenchQuantities project={project} libs={libs} result={result}
          orphanWarn={orphanWarn} invalidWarn={invalidWarn} dismissed={dismissed} orphanCount={orphanCount} orphanCodes={orphanCodes}
          orphanIds={orphanIds} invalidIds={invalidIds} dupCodes={dupCodes} rowStatus={rowStatus}
          setQty={setQty} addQtyRow={addQtyRow}
          deleteQty={(row) => setConfirm({ kind: 'delQty', row })}
          deleteOrphans={() => setConfirm({ kind: 'delOrphans' })}
          dismissWarning={dismissWarning} locateOrphan={locateOrphan} />
      )}
      {tab === 'workload-4a' && (
        <WorkbenchMaterials result={result} libs={libs} project={project}
          deltaOf={deltaOf} priceOf={priceOf} setDelta={setDelta} setPrice={setPrice} toggleRule={toggleRule} />
      )}
      {tab === 'workload-equip' && (
        <WorkbenchEquip result={result} deltaOf={deltaOf} priceOf={priceOf} setDelta={setDelta} setPrice={setPrice} />
      )}
      {tab === 'workload-3b' && <WorkbenchMachines result={result} />}
      {tab === 'workload-3c' && <WorkbenchInstruments result={result} />}
      {tab === 'fee' && <WorkbenchFee result={result} table2Mode={table2Mode} setTable2Mode={setTable2Mode} />}
      {tab === 'table5' && (
        <WorkbenchTable5 profile={profile} project={project} result={result} setTable5Override={setTable5Override} />
      )}
      {tab === 'export' && (
        <div>
          <h3>报表导出</h3>
          <ExportPicker selection={exportSelection} onChange={setExportSelection} onExport={(sel) => exportOne(sel)} />
        </div>
      )}

      {confirmProps && (
        <ConfirmDialog open title={confirmProps.title} impact={confirmProps.impact} samples={confirmProps.samples}
          confirmLabel={confirmProps.confirmLabel} onConfirm={confirmProps.onConfirm} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
