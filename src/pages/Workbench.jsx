import { useMemo, useState } from 'react';
import { calcFor, money, num2, PROJECT_TYPES, getLibraries, uid } from '../lib/store.js';
import { getProfile } from '../lib/profiles.js';
import {
  orphanWarning, invalidWarning, orphanRowIds, invalidRowIds,
  duplicateCodes, rowStatus, deleteOrphanRows, dismissWarningCode,
} from '../lib/workbench.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

const INFO_FIELDS = [
  ['建设单位', 'text'], ['建设项目名称', 'text'], ['单项工程名称', 'text'], ['合同编号', 'text'],
  ['工程类型', 'select'], ['区县', 'text'], ['编制日期', 'text'], ['施工折扣', 'number'],
  ['段落起点', 'text'], ['段落终点', 'text'], ['监理单位', 'text'], ['表格编号', 'text'],
  ['单段工程名称', 'text'], ['项目编号', 'text'], ['施工距离', 'select2'],
  ['施工实际里程', 'number'], ['施工调遣分类', 'select3'], ['施工现场海拔', 'number'],
  ['冬雨季施工费', 'select4'], ['甲供增值税', 'number'], ['乙供增值税', 'number'],
  ['工程负责人', 'text'], ['审核', 'text'], ['编制', 'text'],
];

/** 表二行定义：[展示名, table2 key]，折前/折后/对照三态共用。 */
const TABLE2_ROWS = [
  ['人工费', 'laborTotal'], ['　技工费', 'techFee'], ['　普工费', 'laborFee'],
  ['材料费', 'matTotal'], ['　主要材料费', 'mainMat'], ['　　甲供材料', 'jiaMat'],
  ['　　乙供材料', 'yiMat'], ['　辅助材料费', 'auxMat'],
  ['机械使用费', 'machineFee'], ['仪器仪表费', 'instrumentFee'],
  ['直接工程费', 'directFee'], ['措施费', 'measureFee'],
  ['　环境保护费', 'envFee'], ['　文明施工费', 'civilFee'],
  ['　工地器材搬运费', 'carryFee'], ['　工程干扰费', 'disturbFee'],
  ['　工程点交、场地清理费', 'handoverFee'], ['　临时设施费', 'tempFee'],
  ['　工程车辆使用费', 'vehicleFee'], ['　夜间施工增加费', 'nightFee'],
  ['　冬雨季施工增加费', 'winterFee'], ['　生产工具用具使用费', 'toolFee'],
  ['　施工用水电蒸汽费', 'utilityFee'], ['　已完工程及设备保护费', 'protectFee'],
  ['　施工队伍调遣费', 'dispatchFee'],
  ['直接费', 'directTotal'], ['规费', 'regFee'],
  ['　社会保障费', 'socialFee'], ['　住房公积金', 'housingFee'],
  ['　危险作业意外伤害保险费', 'accidentFee'],
  ['企业管理费', 'mgmtFee'], ['间接费', 'indirectTotal'],
  ['利润', 'profit'],
  ['建筑安装工程费（除税价）', 'exclTax'], ['销项税额', 'outputTax'],
  ['建筑安装工程费（含税价）', 'inclTax'],
];

const STATUS_TEXT = { orphan: '⚠ 未建档', invalid: '⚠ 数量无效', duplicate: '⚠ 编号重复' };

/**
 * 单工程工作台（v2 增量 5，§9）：顶栏 + 左（工程信息）/ 中（工程量录入）/ 右（计算结果）三区，不分页签。
 * 全部数值来自同一次 calcFor；任何编辑 → 本地状态更新 → useMemo 重算 → 三区同步刷新。
 */
export default function Workbench({ db, project, updateDb, back, pushUndo, notify, flushSaves }) {
  const [search, setSearch] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [table2Mode, setTable2Mode] = useState('after'); // after | before | compare
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [showT3, setShowT3] = useState(false);
  const [showMat, setShowMat] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirm, setConfirm] = useState(null); // {kind, ...payload}
  const [highlightId, setHighlightId] = useState(null);

  // 同一次计算结果供三区共用；重算异常时右区显示错误态，不显示旧数值冒充新结果。
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
  // 工程量行改/删按行 id 定位（B7），不按数组下标/编号首条匹配。
  const setQty = (id, field, v) => patch((p) => { const row = p.quantities.find((x) => x.id === id); if (row) row[field] = v; });
  const addQty = (row) => patch((p) => {
    p.quantities.push({ id: uid(), quota: row.code, variant: row.name, unit: row.unit, qty: 0, coef: row.coef ?? 1 });
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
  /** 增值税覆盖：清空 = null（用配置值），不写 0（§2.2.1 null 语义）。 */
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

  const doDeleteQty = (id, label) => {
    snapshotProject(`删除工程量行“${label}”`);
    patch((p) => { p.quantities = p.quantities.filter((x) => x.id !== id); });
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
  const doRename = () => {
    const n = renameDraft.trim();
    setRenaming(false);
    if (!n || n === project.name) return;
    patch((p) => { p.name = n; });
  };

  const locateOrphan = () => {
    const first = project.quantities.find((r) => orphanIds.has(r.id));
    if (!first) return;
    setHighlightId(first.id);
    setTimeout(() => setHighlightId((cur) => (cur === first.id ? null : cur)), 2000);
    document.getElementById(`qty-row-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const doExport = async () => {
    setConfirm(null);
    try {
      if (flushSaves) await flushSaves();
      const file = await window.api.saveFile({ defaultPath: `${project.name}_概预算.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (!file) return;
      const freshResult = calcFor(db, project);
      await window.api.exportBudgetBook({ filePath: file, project, result: freshResult, profileId: project.profileId });
      if (notify) notify(`已导出：${file}`, { undo: false });
    } catch (e) {
      if (notify) notify(`导出失败：${e.message}`, { undo: false });
    }
  };
  const exportOne = () => {
    if (orphanCount > 0) {
      setConfirm({
        kind: 'export',
        title: '仍有孤儿工程量行，确认导出？',
        impact: `有 ${orphanCount} 行工程量引用了库中不存在的定额编号，将不参与计算。\n编号：${orphanCodes.join('、')}\n导出时这些行按“定额编号列写“不取费”、工日列为空”原样呈现（§11）。`,
        confirmLabel: '确认导出',
      });
      return;
    }
    void doExport();
  };

  // 定额库搜索：先搜常用短单，再搜全库（库从工程所属方案取）；全库结果上限 50 条并提示总数。
  const { lib, fullTotal } = useMemo(() => {
    const kw = search.trim();
    if (!kw) return { lib: [], fullTotal: 0 };
    const inShort = libs.shortlist.filter((r) => r.code.includes(kw) || r.name.includes(kw));
    const inFull = libs.quotas.filter((r) => (r.code.includes(kw) || r.name.includes(kw))
      && !inShort.some((s) => s.code === r.code && s.name === r.name));
    return {
      lib: [...inShort.map((r) => ({ ...r, tag: '常用' })), ...inFull.slice(0, 50).map((r) => ({ ...r, tag: '全库' }))],
      fullTotal: inFull.length,
    };
  }, [search, libs]);

  const confirmProps = (() => {
    if (!confirm) return null;
    if (confirm.kind === 'delQty') {
      return {
        title: '删除该工程量行？',
        impact: `定额编号：${confirm.quota}\n项目名称：${confirm.variant}\n数量：${confirm.qty}`,
        confirmLabel: '删除',
        onConfirm: () => doDeleteQty(confirm.id, `${confirm.quota} ${confirm.variant}`),
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
        onConfirm: () => void doExport(),
      };
    }
    return null;
  })();

  const qtyRows = project.quantities;
  const deltaOf = (key) => project.materialAdjust.find((a) => a.key === key)?.delta ?? 0;
  const priceOf = (key, def) => project.materialPriceOverrides.find((a) => a.key === key)?.priceExcl ?? def;
  const manualFees = (profile?.table5Fees || []).filter((f) => f.basis === 'manual');
  const t5Override = (key) => (project.table5Overrides || []).find((o) => o.key === key) || {};
  const vatCfg = profile?.rates?.vatRates || {};

  return (
    <div>
      <div className="toolbar">
        <button className="btn" onClick={back}>← 返回工程列表</button>
        {renaming ? (
          <input className="input" style={{ fontSize: 16, fontWeight: 700, width: 320 }} autoFocus
            value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={doRename} onKeyDown={(e) => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setRenaming(false); }} />
        ) : (
          <b style={{ fontSize: 16, cursor: 'pointer' }} title="点击改名"
            onClick={() => { setRenameDraft(project.name); setRenaming(true); }}>{project.name}</b>
        )}
        <label className="muted">配置方案
          <select className="input" style={{ marginLeft: 6 }} value={project.profileId}
            onChange={(e) => {
              const target = (db.configurationProfiles || []).find((x) => x.id === e.target.value);
              if (!target || target.id === project.profileId) return;
              setConfirm({ kind: 'switchProfile', targetId: target.id, targetName: target.name });
            }}>
            {(db.configurationProfiles || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <span className="muted">总计（含税）{result ? money(result.table1.grandIncl) : '—'} 元</span>
        <button className="btn primary" onClick={exportOne}>导出预算书</button>
      </div>

      <div className="workbench">
        {/* 左区：工程信息（可折叠） */}
        <section className={`wb-left ${leftCollapsed ? 'collapsed' : ''}`}>
          <div className="wb-collapse">
            <button className="btn sm" onClick={() => setLeftCollapsed((v) => !v)}>{leftCollapsed ? '展开工程信息 ▶' : '◀ 折叠'}</button>
          </div>
          {!leftCollapsed && (
            <div>
              <p className="muted">配置方案：{profile?.name ?? '—'}（只读，切换请用顶栏下拉）</p>
              <div className="wb-form">
                {INFO_FIELDS.map(([k, type]) => (
                  <label key={k} className="form-field">{k}
                    {type === 'select' ? (
                      <select className="input" value={project.info[k] ?? ''} onChange={(e) => setInfo(k, e.target.value)}>
                        {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    ) : type === 'select2' ? (
                      <select className="input" value={project.info[k] ?? ''} onChange={(e) => setInfo(k, e.target.value)}>
                        <option value="35KM以内">35KM以内</option><option value="35KM以上">35KM以上</option>
                      </select>
                    ) : type === 'select3' ? (
                      <select className="input" value={project.info[k] ?? ''} onChange={(e) => setInfo(k, e.target.value)}>
                        <option value="施工队伍调遣人数(线路、管道）">施工队伍调遣人数(线路、管道）</option>
                        <option value="施工队伍调遣人数(无线、电源、设备）">施工队伍调遣人数(无线、电源、设备）</option>
                      </select>
                    ) : type === 'select4' ? (
                      <select className="input" value={project.info[k] ?? ''} onChange={(e) => setInfo(k, e.target.value)}>
                        <option value="Ⅰ类地区">Ⅰ类地区</option><option value="Ⅱ类地区">Ⅱ类地区</option><option value="Ⅲ类地区">Ⅲ类地区</option>
                      </select>
                    ) : (
                      <input className="input" type={type === 'number' ? 'number' : 'text'} step="any"
                        value={project.info[k] ?? ''} onChange={(e) => setInfo(k, type === 'number' ? Number(e.target.value) : e.target.value)} />
                    )}
                  </label>
                ))}
              </div>
              <h4 style={{ margin: '14px 0 6px' }}>增值税覆盖（本工程）</h4>
              <p className="muted">为空 = 用配置值；清空即恢复配置值。优先级：本工程覆盖 &gt; 左侧工程信息 &gt; 配置方案。</p>
              {[
                ['jiaTax', '甲供增值税', vatCfg.jiaTax],
                ['yiTax', '乙供增值税', vatCfg.yiTax],
                ['outputTax', '销项税额税率', vatCfg.outputTax ?? vatCfg.yiTax],
              ].map(([key, label, cfgVal]) => (
                <label key={key} className="form-field">{label}
                  <input className="input" type="number" step="any" placeholder={`配置值：${cfgVal ?? '—'}`}
                    value={project.rateOverrides?.[key] ?? ''}
                    onChange={(e) => setRateOverride(key, e.target.value)} />
                </label>
              ))}
              <h4 style={{ margin: '14px 0 6px' }}>表五单项覆盖（本工程）</h4>
              {manualFees.length ? manualFees.map((f) => (
                <label key={f.key} className="form-field">{f.name}（手动填）
                  <input className="input" type="number" step="any" placeholder="为空 = 用配置"
                    value={t5Override(f.key).amount ?? ''}
                    onChange={(e) => setTable5Override(f.key, 'amount', e.target.value === '' ? null : Number(e.target.value))} />
                  <span><input type="checkbox" checked={t5Override(f.key).enabled ?? true}
                    onChange={(e) => setTable5Override(f.key, 'enabled', e.target.checked)} /> 启用</span>
                </label>
              )) : <p className="muted">当前配置无手动填项。</p>}
              <p className="muted" style={{ marginTop: 10 }}>施工折扣：1 = 不打折；0.51 = 打 5.1 折（主材费、规费不打折）。税率默认取乙供增值税。</p>
            </div>
          )}
        </section>

        {/* 中区：工程量录入 */}
        <section className="wb-mid">
          <div className="toolbar">
            <input className="input" style={{ width: 320 }} placeholder="搜索定额编号 / 项目名称，如 TXL3-187、架设光缆…" value={search} onChange={(e) => { setSearch(e.target.value); setShowLibrary(true); }} />
            <label><input type="checkbox" checked={showLibrary} onChange={(e) => setShowLibrary(e.target.checked)} /> 显示搜索结果</label>
            <span className="muted">提示：点搜索结果添加到工程量；数量填 0 即不计。</span>
          </div>
          {showLibrary && search.trim() && (
            <div>
              {fullTotal > 50 && <p className="muted">全库匹配 {fullTotal} 条，仅显示前 50 条，请细化关键词。</p>}
              <table className="table"><thead><tr><th>定额编号</th><th>项目名称</th><th>单位</th><th>工日系数</th><th>来源</th><th></th></tr></thead>
                <tbody>{lib.map((r, i) => (
                  <tr key={i}><td>{r.code}</td><td>{r.name}</td><td>{r.unit}</td><td>{r.coef}</td><td>{r.tag}</td>
                    <td><button className="btn sm" onClick={() => addQty(r)}>添加</button></td></tr>
                ))}
                {!lib.length && <tr><td colSpan={6} className="empty">无匹配定额。可到“定制设置 → 定额库”新增。</td></tr>}
                </tbody></table>
            </div>
          )}
          {orphanWarn && !dismissed.includes('orphanQty') && orphanCount > 0 && (
            <div className="wb-warn">
              <span>{orphanWarn.message}</span>
              <button className="btn sm" onClick={locateOrphan}>定位</button>
              <button className="btn sm" onClick={() => setConfirm({ kind: 'delOrphans' })}>删除孤儿行</button>
              <button className="btn sm" onClick={() => dismissWarning('orphanQty')}>忽略此警告</button>
            </div>
          )}
          {invalidWarn && !dismissed.includes('invalidQty') && (
            <div className="wb-warn">
              <span>{invalidWarn.message}</span>
              <button className="btn sm" onClick={() => dismissWarning('invalidQty')}>忽略此警告</button>
            </div>
          )}
          <table className="table"><thead><tr><th>#</th><th>定额编号</th><th>项目名称</th><th>单位</th><th>数量</th><th>工日系数</th><th>状态</th><th></th></tr></thead>
            <tbody>{qtyRows.map((r, i) => {
              const st = rowStatus(r, { orphanIds, invalidIds, dupCodes });
              return (
                <tr key={r.id ?? i} id={`qty-row-${r.id}`} className={r.id === highlightId ? 'wb-row-hl' : ''}>
                  <td>{i + 1}</td><td>{r.quota}</td><td>{r.variant}</td><td>{r.unit}</td>
                  <td><input className="cell-input" type="number" value={r.qty} onChange={(e) => setQty(r.id, 'qty', Number(e.target.value))} /></td>
                  <td><input className="cell-input" type="number" step="0.1" value={r.coef} onChange={(e) => setQty(r.id, 'coef', Number(e.target.value))} /></td>
                  <td>{STATUS_TEXT[st] || ''}</td>
                  <td><button className="btn sm danger" onClick={() => setConfirm({ kind: 'delQty', id: r.id, quota: r.quota, variant: r.variant, qty: r.qty })}>删除</button></td>
                </tr>
              );
            })}
            {!qtyRows.length && <tr><td colSpan={8} className="empty">暂无工程量。搜索上方定额添加，或用“批量生成”从 Excel 导入。</td></tr>}
            </tbody></table>
          <p className="muted">共 {qtyRows.length} 行，其中孤儿 {orphanCount} 行。</p>
          {!!otherWarnings.length && (
            <p className="muted">其他警告：{otherWarnings.map((w) => w.message).join('；')}</p>
          )}
        </section>

        {/* 右区：计算结果 */}
        <section className="wb-right">
          {calcError ? (
            <div className="wb-warn"><span>计算失败：{calcError}</span></div>
          ) : result && (
            <div>
              <div className="fee-card">
                <h3>表二 · 建筑安装工程费
                  <span style={{ float: 'right' }}>
                    {['after', 'before', 'compare'].map((m) => (
                      <button key={m} className={table2Mode === m ? 'btn sm primary' : 'btn sm'} style={{ marginLeft: 4 }}
                        onClick={() => setTable2Mode(m)}>{m === 'after' ? '折后' : m === 'before' ? '折前' : '对照'}</button>
                    ))}
                  </span>
                </h3>
                <table className="table"><thead><tr><th>费用项</th>
                  {table2Mode === 'compare' ? (<><th style={{ textAlign: 'right' }}>折前</th><th style={{ textAlign: 'right' }}>折后</th></>) : (
                    <th style={{ textAlign: 'right' }}>{table2Mode === 'after' ? '折后' : '折前'}</th>)}
                </tr></thead>
                  <tbody>
                    {TABLE2_ROWS.map(([label, key]) => (
                      <tr key={key}><td>{label}</td>
                        {table2Mode === 'compare' ? (<><td style={{ textAlign: 'right' }}>{money(result.table2Before?.[key])}</td><td style={{ textAlign: 'right' }}>{money(result.table2After?.[key])}</td></>) : (
                          <td style={{ textAlign: 'right', fontWeight: label.includes('除税价') || label.includes('含税价') ? 700 : 400 }}>
                            {money(table2Mode === 'after' ? result.table2After?.[key] ?? result.table2?.[key] : result.table2Before?.[key])}</td>)}
                      </tr>
                    ))}
                  </tbody></table>
              </div>
              <div className="fee-grid" style={{ marginTop: 12 }}>
                <FeeTable title="表一 · 总预算" rows={[
                  ['建筑安装工程费（折前）', result.table1.beforeDiscount],
                  ['建筑安装工程费（折后）', result.table1.afterDiscount],
                  ['工程建设其他费', result.table1.otherFee],
                  ['合计（除税）', result.table1.sumExcl], ['合计（增值税）', result.table1.sumVat],
                  ['合计（含税）', result.table1.sumIncl],
                  ['需要安装的设备费', result.table1.equipFee],
                  ['总计（除税）', result.table1.grandExcl], ['总计（增值税）', result.table1.grandVat],
                  ['总计（含税）', result.table1.grandIncl],
                ]} />
                <FeeTable title="表五 · 工程建设其他费" rows={[
                  ['项目建设管理费', result.table5.mgmt2], ['勘察费', result.table5.surveyFee],
                  ['设计费', result.table5.designFee], ['勘察设计费合计', result.table5.designTotal],
                  ['安全生产费', result.table5.safetyFee],
                  ['总计（除税）', result.table5.totalExcl], ['总计（增值税）', result.table5.totalVat],
                  ['总计（含税）', result.table5.totalIncl],
                ]} note={`勘察长度 ${num2(result.surveyKm)} km`} />
                <FeeTable title="汇总表" rows={[
                  ['施工费（折后）', result.summary.constructionExcl],
                  ['工程建设其它费', result.summary.other],
                  ['总计（除税）', result.summary.totalExcl], ['总计（增值税）', result.summary.totalVat],
                  ['总计（含税）', result.summary.totalIncl],
                ]} />
              </div>
              <div className="wb-collapse" style={{ marginTop: 16 }}>
                <button className="btn sm" onClick={() => setShowT3((v) => !v)}>{showT3 ? '收起表三 ▼' : '展开表三 ▶'}</button>
              </div>
              {showT3 && (
                <div>
                  <h3>表三甲 · 工日（小计 {num2(result.techSub)} / {num2(result.laborSub)}，调整 {result.adjRate * 100}%，合计 {num2(result.techDays)} / {num2(result.laborDays)}）</h3>
                  <table className="table"><thead><tr><th>定额编号</th><th>项目名称</th><th>单位</th><th>数量</th><th>技工单耗</th><th>普工单耗</th><th>技工工日</th><th>普工工日</th></tr></thead>
                    <tbody>{result.table3A.map((r, i) => <tr key={i}><td>{r.code}</td><td>{r.name}</td><td>{r.unit}</td><td>{num2(r.qty)}</td><td>{r.techUnit}</td><td>{r.laborUnit}</td><td>{num2(r.tech)}</td><td>{num2(r.labor)}</td></tr>)}
                    {!result.table3A.length && <tr><td colSpan={8} className="empty">无工日。</td></tr>}</tbody></table>
                  <h3 style={{ marginTop: 20 }}>表三乙 · 机械（合计 {money(result.table3B.total)}）</h3>
                  <table className="table"><thead><tr><th>定额编号</th><th>定额名称</th><th>数量</th><th>机械名称</th><th>单位</th><th>消耗量</th><th>单价</th><th>台班数</th><th>金额</th></tr></thead>
                    <tbody>{result.table3B.rows.map((r, i) => <tr key={i}><td>{r.quota}</td><td>{r.quotaName}</td><td>{num2(r.qty)}</td><td>{r.equipName}</td><td>{r.equipUnit}</td><td>{r.consumption}</td><td>{money(r.price)}</td><td>{num2(r.sessions)}</td><td>{money(r.amount)}</td></tr>)}
                    {!result.table3B.rows.length && <tr><td colSpan={9} className="empty">无机械费。</td></tr>}</tbody></table>
                  <h3 style={{ marginTop: 20 }}>表三丙 · 仪表（合计 {money(result.table3C.total)}）</h3>
                  <table className="table"><thead><tr><th>定额编号</th><th>定额名称</th><th>数量</th><th>仪表名称</th><th>单位</th><th>消耗量</th><th>单价</th><th>台班数</th><th>金额</th></tr></thead>
                    <tbody>{result.table3C.rows.map((r, i) => <tr key={i}><td>{r.quota}</td><td>{r.quotaName}</td><td>{num2(r.qty)}</td><td>{r.equipName}</td><td>{r.equipUnit}</td><td>{r.consumption}</td><td>{money(r.price)}</td><td>{num2(r.sessions)}</td><td>{money(r.amount)}</td></tr>)}
                    {!result.table3C.rows.length && <tr><td colSpan={9} className="empty">无仪表费。</td></tr>}</tbody></table>
                </div>
              )}
              <div className="wb-collapse" style={{ marginTop: 16 }}>
                <button className="btn sm" onClick={() => setShowMat((v) => !v)}>{showMat ? '收起材料表 ▼' : '展开材料表 ▶'}</button>
              </div>
              {showMat && (
                <div>
                  <p className="muted">数量 = 自动计算 ＋ 手动调整；单价为本工程单价（改这里只影响本工程，到“定制设置 → 材料库”改全局默认价）。备选材料默认不计，在下方勾选启用。</p>
                  <MatTable title="甲供主材（表四甲）" table={result.table4A} deltaOf={deltaOf} priceOf={priceOf} setDelta={setDelta} setPrice={setPrice} />
                  <MatTable title="乙供主材（表四乙）" table={result.table4B} deltaOf={deltaOf} priceOf={priceOf} setDelta={setDelta} setPrice={setPrice} />
                  <MatTable title="甲供设备（表四甲设备）" table={result.table4Equip} deltaOf={deltaOf} priceOf={priceOf} setDelta={setDelta} setPrice={setPrice} />
                  <h3 style={{ marginTop: 24 }}>备选材料（默认不计，勾选后按变体精确匹配计入）</h3>
                  <table className="table"><thead><tr><th>定额编号</th><th>变体项目名称</th><th>材料</th><th>规格</th><th>单位消耗量</th><th>启用</th></tr></thead>
                    <tbody>{libs.rules.filter((r) => r.kind === '备选').map((r) => {
                      const on = project.ruleOverrides.find((o) => o.ruleId === r.id)?.enabled;
                      return <tr key={r.id}><td>{r.quota}</td><td>{r.variant}</td><td>{r.material}</td><td>{r.spec}</td><td>{r.consumption}</td>
                        <td><input type="checkbox" checked={!!on} onChange={(e) => toggleRule(r.id, e.target.checked)} /></td></tr>;
                    })}</tbody></table>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {confirmProps && (
        <ConfirmDialog open title={confirmProps.title} impact={confirmProps.impact} samples={confirmProps.samples}
          confirmLabel={confirmProps.confirmLabel} onConfirm={confirmProps.onConfirm} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}

function FeeTable({ title, rows, note }) {
  return (
    <div className="fee-card"><h3>{title}{note ? <span className="muted">（{note}）</span> : ''}</h3>
      <table className="table"><tbody>
        {rows.map(([k, v], i) => <tr key={i}><td>{k}</td><td style={{ textAlign: 'right', fontWeight: k.includes('总计') || k.includes('合计') || k.includes('除税价') || k.includes('含税价') ? 700 : 400 }}>{money(v)}</td></tr>)}
      </tbody></table>
    </div>
  );
}

function MatTable({ title, table, deltaOf, priceOf, setDelta, setPrice }) {
  return (
    <div><h3>{title}（合计除税 {money(table.totalExcl)}，增值税 {money(table.totalVat)}，含税 {money(table.totalIncl)}）</h3>
      <table className="table"><thead><tr><th>名称</th><th>规格</th><th>单位</th><th>自动数量</th><th>手动调整</th><th>数量</th><th>除税单价</th><th>增值税/单位</th><th>含税单价</th><th>除税合计</th><th>增值税合计</th></tr></thead>
        <tbody>{table.rows.map((r) => (
          <tr key={r.key}><td>{r.name}{r.unmatched ? '（未建档）' : ''}</td><td>{r.spec}</td><td>{r.unit}</td>
            <td>{num2(r.autoQty)}</td>
            <td><input className="cell-input" type="number" value={deltaOf(r.key)} onChange={(e) => setDelta(r.key, Number(e.target.value))} /></td>
            <td>{num2(r.qty)}</td>
            <td><input className="cell-input" type="number" value={priceOf(r.key, r.priceExcl)} onChange={(e) => setPrice(r.key, Number(e.target.value))} /></td>
            <td>{money(r.priceVat)}</td><td>{money(r.priceIncl)}</td><td>{money(r.amtExcl)}</td><td>{money(r.amtVat)}</td></tr>
        ))}
        {!table.rows.length && <tr><td colSpan={11} className="empty">无材料。</td></tr>}
        </tbody></table>
    </div>
  );
}
