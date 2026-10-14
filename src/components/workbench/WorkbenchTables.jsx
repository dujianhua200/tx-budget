import { money, num2 } from '../../lib/store.js';
import { buildTable5ViewRows } from '../../lib/v3.js';

/** 材料表（表四甲结构，复用于材料汇总三组 / 安装设备子集）。 */
export function MatTable({ title, table, deltaOf, priceOf, setDelta, setPrice }) {
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

/** 工作量 · 材料汇总（表四甲：甲供 / 乙供 / 设备三组）+ 备选材料勾选。 */
export function WorkbenchMaterials({ result, libs, project, deltaOf, priceOf, setDelta, setPrice, toggleRule }) {
  if (!result) return <div className="empty">计算失败。</div>;
  return (
    <div>
      <p className="muted">数量 = 自动计算 ＋ 手动调整；单价为本工程单价（改这里只影响本工程，到“基础库 → 材料库”改全局默认价）。备选材料默认不计，在下方勾选启用。</p>
      <MatTable title="甲供主材（表四甲）" table={result.table4A} deltaOf={deltaOf} priceOf={priceOf} setDelta={setDelta} setPrice={setPrice} />
      <MatTable title="乙供主材（表四乙）" table={result.table4B} deltaOf={deltaOf} priceOf={priceOf} setDelta={setDelta} setPrice={setPrice} />
      <MatTable title="设备（表四甲设备）" table={result.table4Equip} deltaOf={deltaOf} priceOf={priceOf} setDelta={setDelta} setPrice={setPrice} />
      <h3 style={{ marginTop: 24 }}>备选材料（默认不计，勾选后按变体精确匹配计入）</h3>
      <table className="table"><thead><tr><th>定额编号</th><th>变体项目名称</th><th>材料</th><th>规格</th><th>单位消耗量</th><th>启用</th></tr></thead>
        <tbody>{libs.rules.filter((r) => r.kind === '备选').map((r) => {
          const on = project.ruleOverrides.find((o) => o.ruleId === r.id)?.enabled;
          return <tr key={r.id}><td>{r.quota}</td><td>{r.variant}</td><td>{r.material}</td><td>{r.spec}</td><td>{r.consumption}</td>
            <td><input type="checkbox" checked={!!on} onChange={(e) => toggleRule(r.id, e.target.checked)} /></td></tr>;
        })}</tbody></table>
    </div>
  );
}

/** 工作量 · 安装设备（表四甲：supply = '设备' 子集，即 table4Equip，不新增字段）。 */
export function WorkbenchEquip({ result, deltaOf, priceOf, setDelta, setPrice }) {
  if (!result) return <div className="empty">计算失败。</div>;
  return (
    <div>
      <p className="muted">仅显示 supply = “设备” 的材料行（即表四甲设备组），不新增字段。</p>
      <MatTable title="安装设备（表四甲 · 设备）" table={result.table4Equip} deltaOf={deltaOf} priceOf={priceOf} setDelta={setDelta} setPrice={setPrice} />
    </div>
  );
}

/** 工作量 · 机械（表三乙）。 */
export function WorkbenchMachines({ result }) {
  if (!result) return <div className="empty">计算失败。</div>;
  return (
    <div>
      <h3>表三乙 · 机械（合计 {money(result.table3B.total)}）</h3>
      <table className="table"><thead><tr><th>定额编号</th><th>定额名称</th><th>数量</th><th>机械名称</th><th>单位</th><th>消耗量</th><th>单价</th><th>台班数</th><th>金额</th></tr></thead>
        <tbody>{result.table3B.rows.map((r, i) => <tr key={i}><td>{r.quota}</td><td>{r.quotaName}</td><td>{num2(r.qty)}</td><td>{r.equipName}</td><td>{r.equipUnit}</td><td>{r.consumption}</td><td>{money(r.price)}</td><td>{num2(r.sessions)}</td><td>{money(r.amount)}</td></tr>)}
        {!result.table3B.rows.length && <tr><td colSpan={9} className="empty">无机械费。</td></tr>}</tbody></table>
    </div>
  );
}

/**
 * 工作量 · 仪器仪表（表三丙统一大表，不拆碎）。
 * 列：定额编号 / 项目名称 / 单位 / 数量 | 仪器仪表名称 | 单位定额值 数量 / 单价 | 合计值 数量 / 合计。
 */
export function WorkbenchInstruments({ result }) {
  if (!result) return <div className="empty">计算失败。</div>;
  return (
    <div>
      <h3>表三丙 · 仪器仪表（合计 {money(result.table3C.total)}）</h3>
      <table className="table"><thead>
        <tr><th colSpan={4}>定额</th><th rowSpan={2}>仪器仪表名称</th><th colSpan={2}>单位定额值</th><th colSpan={2}>合计值</th></tr>
        <tr><th>定额编号</th><th>项目名称</th><th>单位</th><th>数量</th><th>数量</th><th>单价</th><th>数量</th><th>合计</th></tr>
      </thead>
        <tbody>{result.table3C.rows.map((r, i) => (
          <tr key={i}><td>{r.quota}</td><td>{r.quotaName}</td><td>{r.unit}</td><td>{num2(r.qty)}</td>
            <td>{r.equipName}</td><td>{r.consumption}</td><td>{money(r.price)}</td><td>{num2(r.sessions)}</td><td>{money(r.amount)}</td></tr>
        ))}
        {!result.table3C.rows.length && <tr><td colSpan={9} className="empty">无仪表费。</td></tr>}</tbody></table>
    </div>
  );
}

/** 表二行定义：[展示名, table2 key]，折前/折后/对照三态共用。 */
export const TABLE2_ROWS = [
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

/** 当前工程 · 费用（表二）：折后 / 折前 / 对照三态。 */
export function WorkbenchFee({ result, table2Mode, setTable2Mode }) {
  if (!result) return <div className="empty">计算失败。</div>;
  return (
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
  );
}

const BASIS_LABEL = {
  manual: '手动输入', preDiscountExclTax: '折前建安工程费除税价', afterDiscountExclTax: '折后建安工程费除税价',
  laborTotal: '人工费（折前）', fixed: '固定金额', surveyKm: '勘察长度', sum: '子项之和',
};

/**
 * 当前工程 · 表五（§13.11.4）：完整表格，列：费用名称 / 计算基数 / 费率 / 金额 / 公式 / 启用勾选。
 * 金额取 result.table5；手动项可覆盖（table5Overrides.amount）。
 */
export function WorkbenchTable5({ profile, project, result, setTable5Override }) {
  if (!result) return <div className="empty">计算失败。</div>;
  const rows = buildTable5ViewRows(profile, project, result);
  return (
    <div>
      <h3>表五 · 工程建设其他费</h3>
      <table className="table"><thead><tr>
        <th>费用名称</th><th>计算基数</th><th>费率</th><th style={{ textAlign: 'right' }}>金额（元）</th><th>公式</th><th>启用</th>
      </tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.key}>
            <td>{r.name}</td>
            <td className="muted">{BASIS_LABEL[r.basis] || r.basis}</td>
            <td>{r.rate == null ? '—' : `${(r.rate * 100).toFixed(4).replace(/\.?0+$/, '')}%`}</td>
            <td style={{ textAlign: 'right' }}>
              {r.basis === 'manual' ? (
                <input className="cell-input" style={{ textAlign: 'right' }} type="number" step="any"
                  value={(project.table5Overrides || []).find((o) => o.key === r.key)?.amount ?? ''}
                  placeholder={r.amount != null ? String(r.amount) : '手动输入'}
                  onChange={(e) => setTable5Override(r.key, 'amount', e.target.value === '' ? null : Number(e.target.value))} />
              ) : money(r.amount)}
            </td>
            <td className="muted">{r.formula}</td>
            <td><input type="checkbox" checked={r.enabled}
              onChange={(e) => setTable5Override(r.key, 'enabled', e.target.checked)} /></td>
          </tr>
        ))}
        </tbody></table>
      <p className="muted">总计（除税）{money(result.table5.totalExcl)} · 增值税 {money(result.table5.totalVat)} · 含税 {money(result.table5.totalIncl)}</p>
    </div>
  );
}
