import { useState } from 'react';
import { PROJECT_TYPES, RATE_ITEMS, uid } from '../lib/store.js';

/** 定制设置：材料库 / 定额库 / 费率 / 关联规则 / 配置导入导出 */
export default function Settings({ db, updateDb }) {
  const [tab, setTab] = useState('mat');
  const [q, setQ] = useState('');
  const [rateType, setRateType] = useState('通信线路工程');

  const patchLib = (fn) => updateDb((d) => { fn(d.libraries); });

  const exportConfig = async () => {
    const file = await window.api.saveFile({ defaultPath: '概预算配置备份.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!file) return;
    const { ipcRenderer } = { ipcRenderer: null };
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.split('/').pop();
    a.click();
    URL.revokeObjectURL(a.href);
    alert('配置已导出。注意：浏览器下载会落到下载文件夹，如需指定路径请在下载后移动。');
  };

  const rateCol = PROJECT_TYPES.indexOf(rateType);
  const setRate = (hlookupN, value) => patchLib((L) => {
    const row = L.rateGrid[3 + hlookupN - 2];
    if (row) row[6 + rateCol] = value;
  });

  return (
    <div>
      <h2>定制设置</h2>
      <p className="muted">这里改的是全局默认库：定额、材料、费率、关联规则。改完后所有工程重新计算；单个工程的特例（单价、调整量）请在工程内改，不会污染全局。</p>
      <div className="tabs">
        {['mat', 'quota', 'rate', 'rule', 'config'].map((t) => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t === 'mat' ? '材料库' : t === 'quota' ? '定额库' : t === 'rate' ? '费率' : t === 'rule' ? '关联规则' : '配置导入导出'}
          </button>
        ))}
      </div>

      {tab === 'mat' && (
        <div>
          <div className="toolbar">
            <input className="input" style={{ width: 300 }} placeholder="搜索材料名称 / 规格…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn primary" onClick={() => patchLib((L) => { L.materials.unshift({ id: uid(), name: '新材料', spec: '', unit: '', priceExcl: 0, supply: '甲供', remark: '' }); })}>＋ 新增材料</button>
          </div>
          <table className="table"><thead><tr><th>名称</th><th>规格</th><th>单位</th><th>除税单价</th><th>供货</th><th>备注</th><th></th></tr></thead>
            <tbody>{db.libraries.materials.filter((m) => !q || m.name.includes(q) || m.spec.includes(q)).slice(0, 200).map((m) => (
              <tr key={m.id}>
                <td><input className="cell-input" value={m.name} onChange={(e) => patchLib((L) => { L.materials.find((x) => x.id === m.id).name = e.target.value; })} /></td>
                <td><input className="cell-input" value={m.spec} onChange={(e) => patchLib((L) => { L.materials.find((x) => x.id === m.id).spec = e.target.value; })} /></td>
                <td><input className="cell-input" style={{ width: 60 }} value={m.unit} onChange={(e) => patchLib((L) => { L.materials.find((x) => x.id === m.id).unit = e.target.value; })} /></td>
                <td><input className="cell-input" type="number" value={m.priceExcl} onChange={(e) => patchLib((L) => { L.materials.find((x) => x.id === m.id).priceExcl = Number(e.target.value); })} /></td>
                <td><select className="input" value={m.supply} onChange={(e) => patchLib((L) => { L.materials.find((x) => x.id === m.id).supply = e.target.value; })}><option>甲供</option><option>乙供</option><option>设备</option></select></td>
                <td><input className="cell-input" value={m.remark} onChange={(e) => patchLib((L) => { L.materials.find((x) => x.id === m.id).remark = e.target.value; })} /></td>
                <td><button className="btn sm danger" onClick={() => patchLib((L) => { L.materials = L.materials.filter((x) => x.id !== m.id); })}>删除</button></td>
              </tr>
            ))}</tbody></table>
        </div>
      )}

      {tab === 'quota' && (
        <div>
          <div className="toolbar">
            <input className="input" style={{ width: 300 }} placeholder="搜索定额编号 / 名称…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn primary" onClick={() => patchLib((L) => { L.quotas.unshift({ code: 'NEW-' + uid().slice(0, 4), name: '新定额', unit: '', tech: 0, labor: 0, coef: 1, book: '', alias: '' }); })}>＋ 新增定额</button>
            <button className="btn" onClick={async () => {
              const file = await window.api.openFile([{ name: 'Excel', extensions: ['xlsx', 'xls'] }]);
              if (!file) return;
              const imported = await window.api.importQuotas(file);
              if (!imported.length) return alert('未识别到定额行。表头应为：定额编号 / 定额名称 / 单位 / 技工 / 普工 / 系数 / 分册名称（或直接用母版定额表）。');
              const mode = confirm(`读到 ${imported.length} 条定额。\n点“确定”= 合并（同编号覆盖，不同编号追加）；\n点“取消”= 全部替换当前定额库。`);
              patchLib((L) => {
                if (mode) {
                  const byCode = new Map(L.quotas.map((x) => [x.code, x]));
                  for (const nq of imported) byCode.set(nq.code, nq);
                  L.quotas = [...byCode.values()];
                } else L.quotas = imported;
              });
              alert('定额库导入完成。');
            }}>从 Excel 导入定额库</button>
            <button className="btn" onClick={async () => {
              const file = await window.api.saveFile({ defaultPath: '定额库.xlsx', filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
              if (file) { await window.api.exportQuotas({ filePath: file, quotas: db.libraries.quotas }); alert('定额库已导出：' + file); }
            }}>导出定额库到 Excel</button>
          </div>
          <p className="muted">定额库由你自己维护：在 Excel 里改完再导入（合并/替换），或直接在下方表格里改。当前 {db.libraries.quotas.length} 条。</p>
          <table className="table"><thead><tr><th>定额编号</th><th>定额名称</th><th>单位</th><th>技工/单位</th><th>普工/单位</th><th>系数</th><th>分册</th><th></th></tr></thead>
            <tbody>{db.libraries.quotas.filter((x) => !q || x.code.includes(q) || x.name.includes(q)).slice(0, 200).map((x, i) => (
              <tr key={x.code + i}>
                <td><input className="cell-input" value={x.code} onChange={(e) => patchLib((L) => { L.quotas.find((y) => y.code === x.code).code = e.target.value; })} /></td>
                <td><input className="cell-input" value={x.name} onChange={(e) => patchLib((L) => { L.quotas.find((y) => y.code === x.code).name = e.target.value; })} /></td>
                <td><input className="cell-input" style={{ width: 60 }} value={x.unit} onChange={(e) => patchLib((L) => { L.quotas.find((y) => y.code === x.code).unit = e.target.value; })} /></td>
                <td><input className="cell-input" type="number" step="0.01" value={x.tech} onChange={(e) => patchLib((L) => { L.quotas.find((y) => y.code === x.code).tech = Number(e.target.value); })} /></td>
                <td><input className="cell-input" type="number" step="0.01" value={x.labor} onChange={(e) => patchLib((L) => { L.quotas.find((y) => y.code === x.code).labor = Number(e.target.value); })} /></td>
                <td><input className="cell-input" type="number" step="0.1" style={{ width: 60 }} value={x.coef} onChange={(e) => patchLib((L) => { L.quotas.find((y) => y.code === x.code).coef = Number(e.target.value); })} /></td>
                <td>{x.book}</td>
                <td><button className="btn sm danger" onClick={() => patchLib((L) => { L.quotas = L.quotas.filter((y) => y.code !== x.code); })}>删除</button></td>
              </tr>
            ))}</tbody></table>
        </div>
      )}

      {tab === 'rate' && (
        <div>
          <div className="toolbar">
            <label>工程类型 <select className="input" value={rateType} onChange={(e) => setRateType(e.target.value)}>
              {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>
            <span className="muted">费率按工程类型取；改这里即改该类型下所有工程的取费。增值税率 = 乙供增值税（在工程信息中改）；冬雨季按地区类别查冬雨季表。</span>
          </div>
          <table className="table"><thead><tr><th>费率项目</th><th>数值</th><th>说明</th></tr></thead>
            <tbody>{RATE_ITEMS.filter((it) => it.key !== 'taxRate').map((it) => {
              const v = db.libraries.rateGrid[3 + it.n - 2]?.[6 + rateCol];
              const isMoney = it.key === 'techPrice' || it.key === 'laborPrice';
              return <tr key={it.key}><td>{it.name}</td>
                <td><input className="cell-input" type="number" step="any" value={typeof v === 'number' ? v : 0} onChange={(e) => setRate(it.n, Number(e.target.value))} /></td>
                <td>{isMoney ? '元/工日' : '费率（小数，如 0.003 = 0.3%）'}</td></tr>;
            })}
            <tr><td>冬雨季施工增加费（Ⅰ类地区）</td><td><input className="cell-input" type="number" step="any" value={db.libraries.winterTable['Ⅰ类地区']} onChange={(e) => patchLib((L) => { L.winterTable['Ⅰ类地区'] = Number(e.target.value); })} /></td><td>费率</td></tr>
            <tr><td>冬雨季施工增加费（Ⅱ类地区）</td><td><input className="cell-input" type="number" step="any" value={db.libraries.winterTable['Ⅱ类地区']} onChange={(e) => patchLib((L) => { L.winterTable['Ⅱ类地区'] = Number(e.target.value); })} /></td><td>费率</td></tr>
            <tr><td>冬雨季施工增加费（Ⅲ类地区）</td><td><input className="cell-input" type="number" step="any" value={db.libraries.winterTable['Ⅲ类地区']} onChange={(e) => patchLib((L) => { L.winterTable['Ⅲ类地区'] = Number(e.target.value); })} /></td><td>费率</td></tr>
            </tbody></table>
        </div>
      )}

      {tab === 'rule' && (
        <div>
          <div className="toolbar">
            <input className="input" style={{ width: 300 }} placeholder="搜索定额编号 / 材料 / 变体…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn primary" onClick={() => patchLib((L) => { L.rules.unshift({ id: uid(), quota: '', material: '', spec: '', unit: '', consumption: 0, supply: '甲供', kind: '变体', variant: '', remark: '' }); })}>＋ 新增规则</button>
          </div>
          <p className="muted">变体：变体项目名称精确匹配；变体*：前缀匹配（同时匹配普通行与“工日X0.5”行）；通用：按定额编号汇总全部工程量；备选：默认不计，工程内勾选启用。</p>
          <table className="table"><thead><tr><th>定额编号</th><th>材料</th><th>规格</th><th>单位</th><th>单位消耗量</th><th>供货</th><th>类型</th><th>变体项目名称</th><th></th></tr></thead>
            <tbody>{db.libraries.rules.filter((r) => !q || r.quota.includes(q) || r.material.includes(q) || (r.variant || '').includes(q)).map((r) => (
              <tr key={r.id}>
                <td><input className="cell-input" value={r.quota} onChange={(e) => patchLib((L) => { L.rules.find((x) => x.id === r.id).quota = e.target.value; })} /></td>
                <td><input className="cell-input" value={r.material} onChange={(e) => patchLib((L) => { L.rules.find((x) => x.id === r.id).material = e.target.value; })} /></td>
                <td><input className="cell-input" value={r.spec} onChange={(e) => patchLib((L) => { L.rules.find((x) => x.id === r.id).spec = e.target.value; })} /></td>
                <td><input className="cell-input" style={{ width: 60 }} value={r.unit} onChange={(e) => patchLib((L) => { L.rules.find((x) => x.id === r.id).unit = e.target.value; })} /></td>
                <td><input className="cell-input" type="number" step="any" value={r.consumption} onChange={(e) => patchLib((L) => { L.rules.find((x) => x.id === r.id).consumption = Number(e.target.value); })} /></td>
                <td><select className="input" value={r.supply} onChange={(e) => patchLib((L) => { L.rules.find((x) => x.id === r.id).supply = e.target.value; })}><option>甲供</option><option>乙供</option><option>设备</option></select></td>
                <td><select className="input" value={r.kind} onChange={(e) => patchLib((L) => { L.rules.find((x) => x.id === r.id).kind = e.target.value; })}><option>变体</option><option>变体*</option><option>通用</option><option>备选</option></select></td>
                <td><input className="cell-input" style={{ width: 200 }} value={r.variant} onChange={(e) => patchLib((L) => { L.rules.find((x) => x.id === r.id).variant = e.target.value; })} /></td>
                <td><button className="btn sm danger" onClick={() => patchLib((L) => { L.rules = L.rules.filter((x) => x.id !== r.id); })}>删除</button></td>
              </tr>
            ))}</tbody></table>
        </div>
      )}

      {tab === 'config' && (
        <div>
          <p>全部数据（工程 + 定额库 + 材料库 + 费率 + 关联规则）存在本地一个 JSON 文件中，软件每次修改自动保存并保留最近 5 份备份。</p>
          <p className="muted">备份位置：~/Library/Application Support/通信概预算/budget-data.json（及 budget-data.backup-*.json）。换电脑时把该文件拷过去即可；也可以用下方导出做手动备份。</p>
          <button className="btn primary" onClick={exportConfig}>导出全部配置（JSON）</button>
          <p style={{ marginTop: 16 }} className="muted">导入配置：把备份的 JSON 文件内容恢复到该位置后重启软件即可（后续版本会加一键导入）。</p>
        </div>
      )}
    </div>
  );
}
