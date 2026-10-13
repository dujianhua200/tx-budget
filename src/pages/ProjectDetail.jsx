import { useMemo, useState } from 'react';
import { calcFor, money, num2, PROJECT_TYPES } from '../lib/store.js';

const INFO_FIELDS = [
  ['建设单位', 'text'], ['建设项目名称', 'text'], ['单项工程名称', 'text'], ['合同编号', 'text'],
  ['工程类型', 'select'], ['区县', 'text'], ['编制日期', 'text'], ['施工折扣', 'number'],
  ['段落起点', 'text'], ['段落终点', 'text'], ['监理单位', 'text'], ['表格编号', 'text'],
  ['单段工程名称', 'text'], ['项目编号', 'text'], ['施工距离', 'select2'],
  ['施工实际里程', 'number'], ['施工调遣分类', 'select3'], ['施工现场海拔', 'number'],
  ['冬雨季施工费', 'select4'], ['甲供增值税', 'number'], ['乙供增值税', 'number'],
  ['工程负责人', 'text'], ['审核', 'text'], ['编制', 'text'],
];

export default function ProjectDetail({ db, project, updateDb, back }) {
  const [tab, setTab] = useState('qty');
  const [search, setSearch] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const result = useMemo(() => calcFor(db, project), [db, project]);

  const patch = (fn) => updateDb((d) => {
    const p = d.projects.find((x) => x.id === project.id);
    if (p) { fn(p); p.updatedAt = new Date().toISOString(); }
  });
  const setInfo = (k, v) => patch((p) => { p.info[k] = v; });
  const setQty = (i, field, v) => patch((p) => { p.quantities[i][field] = v; });
  const delQty = (i) => patch((p) => { p.quantities.splice(i, 1); });
  const addQty = (row) => patch((p) => {
    p.quantities.push({ quota: row.code, variant: row.name, unit: row.unit, qty: 0, coef: row.coef ?? 1 });
  });

  // 定额库搜索：先搜常用短单，再搜全库
  const lib = useMemo(() => {
    const kw = search.trim();
    if (!kw) return [];
    const inShort = db.libraries.shortlist.filter((r) => r.code.includes(kw) || r.name.includes(kw));
    const inFull = db.libraries.quotas.filter((r) => (r.code.includes(kw) || r.name.includes(kw))
      && !inShort.some((s) => s.code === r.code && s.name === r.name));
    return [...inShort.map((r) => ({ ...r, tag: '常用' })), ...inFull.slice(0, 50).map((r) => ({ ...r, tag: '全库' }))];
  }, [search, db]);

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

  const exportOne = async () => {
    const file = await window.api.saveFile({ defaultPath: `${project.name}_概预算.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
    if (file) { await window.api.exportProject({ filePath: file, project, result }); alert('已导出：' + file); }
  };

  const qtyRows = project.quantities;
  const deltaOf = (key) => project.materialAdjust.find((a) => a.key === key)?.delta ?? 0;
  const priceOf = (key, def) => project.materialPriceOverrides.find((a) => a.key === key)?.priceExcl ?? def;

  return (
    <div>
      <div className="toolbar">
        <button className="btn" onClick={back}>← 返回工程列表</button>
        <b style={{ fontSize: 16 }}>{project.name}</b>
        <span className="muted">总计（含税）{money(result.table1.grandIncl)} 元</span>
        <button className="btn primary" onClick={exportOne}>导出预算书（Excel）</button>
      </div>
      <div className="tabs">
        {['qty', 'fee', 'mat', 't3', 'info'].map((t) => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t === 'qty' ? '工程量' : t === 'fee' ? '费用表' : t === 'mat' ? '材料表' : t === 't3' ? '表三' : '工程信息'}
          </button>
        ))}
      </div>

      {tab === 'qty' && (
        <div>
          <div className="toolbar">
            <input className="input" style={{ width: 320 }} placeholder="搜索定额编号 / 项目名称，如 TXL3-187、架设光缆…" value={search} onChange={(e) => { setSearch(e.target.value); setShowLibrary(true); }} />
            <label><input type="checkbox" checked={showLibrary} onChange={(e) => setShowLibrary(e.target.checked)} /> 显示搜索结果</label>
            <span className="muted">提示：点搜索结果添加到工程量；数量填 0 即不计。</span>
          </div>
          {showLibrary && search.trim() && (
            <table className="table"><thead><tr><th>定额编号</th><th>项目名称</th><th>单位</th><th>工日系数</th><th>来源</th><th></th></tr></thead>
              <tbody>{lib.map((r, i) => (
                <tr key={i}><td>{r.code}</td><td>{r.name}</td><td>{r.unit}</td><td>{r.coef}</td><td>{r.tag}</td>
                  <td><button className="btn sm" onClick={() => addQty(r)}>添加</button></td></tr>
              ))}
              {!lib.length && <tr><td colSpan={6} className="empty">无匹配定额。可到“定制设置 → 定额库”新增。</td></tr>}
              </tbody></table>
          )}
          <table className="table"><thead><tr><th>#</th><th>定额编号</th><th>项目名称</th><th>单位</th><th>数量</th><th>工日系数</th><th></th></tr></thead>
            <tbody>{qtyRows.map((r, i) => (
              <tr key={i}><td>{i + 1}</td><td>{r.quota}</td><td>{r.variant}</td><td>{r.unit}</td>
                <td><input className="cell-input" type="number" value={r.qty} onChange={(e) => setQty(i, 'qty', Number(e.target.value))} /></td>
                <td><input className="cell-input" type="number" step="0.1" value={r.coef} onChange={(e) => setQty(i, 'coef', Number(e.target.value))} /></td>
                <td><button className="btn sm danger" onClick={() => delQty(i)}>删除</button></td></tr>
            ))}
            {!qtyRows.length && <tr><td colSpan={7} className="empty">暂无工程量。搜索上方定额添加，或用“批量生成”从 Excel 导入。</td></tr>}
            </tbody></table>
        </div>
      )}

      {tab === 'fee' && (
        <div className="fee-grid">
          <FeeTable title="表二 · 建筑安装工程费" rows={[
            ['人工费', result.table2.laborTotal], ['　技工费', result.table2.techFee], ['　普工费', result.table2.laborFee],
            ['材料费', result.table2.matTotal], ['　主要材料费', result.table2.mainMat], ['　　甲供材料', result.table2.jiaMat],
            ['　　乙供材料', result.table2.yiMat], ['　辅助材料费', result.table2.auxMat],
            ['机械使用费', result.table2.machineFee], ['仪器仪表费', result.table2.instrumentFee],
            ['直接工程费', result.table2.directFee], ['措施费', result.table2.measureFee],
            ['　环境保护费', result.table2.envFee], ['　文明施工费', result.table2.civilFee],
            ['　工地器材搬运费', result.table2.carryFee], ['　工程干扰费', result.table2.disturbFee],
            ['　工程点交、场地清理费', result.table2.handoverFee], ['　临时设施费', result.table2.tempFee],
            ['　工程车辆使用费', result.table2.vehicleFee], ['　夜间施工增加费', result.table2.nightFee],
            ['　冬雨季施工增加费', result.table2.winterFee], ['　生产工具用具使用费', result.table2.toolFee],
            ['　施工用水电蒸汽费', result.table2.utilityFee], ['　已完工程及设备保护费', result.table2.protectFee],
            ['　施工队伍调遣费', result.table2.dispatchFee],
            ['直接费', result.table2.directTotal], ['规费', result.table2.regFee],
            ['　社会保障费', result.table2.socialFee], ['　住房公积金', result.table2.housingFee],
            ['　危险作业意外伤害保险费', result.table2.accidentFee],
            ['企业管理费', result.table2.mgmtFee], ['间接费', result.table2.indirectTotal],
            ['利润', result.table2.profit],
            ['建筑安装工程费（除税价）', result.table2.exclTax], ['销项税额', result.table2.outputTax],
            ['建筑安装工程费（含税价）', result.table2.inclTax],
          ]} />
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
            ['工程建设其它费', result.summary.other], ['自购物资', result.summary.selfMat],
            ['总计（除税）', result.summary.totalExcl], ['总计（增值税）', result.summary.totalVat],
            ['总计（含税）', result.summary.totalIncl],
          ]} />
        </div>
      )}

      {tab === 'mat' && (
        <div>
          <p className="muted">数量 = 自动计算 ＋ 手动调整；单价为本工程单价（改这里只影响本工程，到“定制设置 → 材料库”改全局默认价）。备选材料默认不计，在下方勾选启用。</p>
          <MatTable title="甲供主材（表四甲）" table={result.table4A} deltaOf={deltaOf} priceOf={priceOf} setDelta={setDelta} setPrice={setPrice} />
          <MatTable title="乙供主材（表四乙）" table={result.table4B} deltaOf={deltaOf} priceOf={priceOf} setDelta={setDelta} setPrice={setPrice} />
          <MatTable title="甲供设备（表四甲设备）" table={result.table4Equip} deltaOf={deltaOf} priceOf={priceOf} setDelta={setDelta} setPrice={setPrice} />
          <h3 style={{ marginTop: 24 }}>备选材料（默认不计，勾选后按变体精确匹配计入）</h3>
          <table className="table"><thead><tr><th>定额编号</th><th>变体项目名称</th><th>材料</th><th>规格</th><th>单位消耗量</th><th>启用</th></tr></thead>
            <tbody>{db.libraries.rules.filter((r) => r.kind === '备选').map((r) => {
              const on = project.ruleOverrides.find((o) => o.ruleId === r.id)?.enabled;
              return <tr key={r.id}><td>{r.quota}</td><td>{r.variant}</td><td>{r.material}</td><td>{r.spec}</td><td>{r.consumption}</td>
                <td><input type="checkbox" checked={!!on} onChange={(e) => toggleRule(r.id, e.target.checked)} /></td></tr>;
            })}</tbody></table>
        </div>
      )}

      {tab === 't3' && (
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

      {tab === 'info' && (
        <div className="form-grid">
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
          <p className="muted">施工折扣：1 = 不打折；0.51 = 打 5.1 折（主材费、规费不打折）。税率默认取乙供增值税。</p>
        </div>
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
