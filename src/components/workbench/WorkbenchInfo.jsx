import { useRef, useState } from 'react';
import { PROJECT_TYPES } from '../../lib/store.js';
import { discountOption, applyDiscountOption } from '../../lib/v3.js';

/**
 * 工程信息完整表单（v3.0 §13.11.3）：分组（基本信息 / 参建单位 / 编制信息 / 取费与折扣）。
 * 施工单位 / 设计单位为新增可选字段（旧数据缺省空）；取费标准 = 工程配置方案下拉；
 * 打折选项单选派生自施工折扣（=1 → 不打折），不新增数据字段。
 */
const FIELD_TYPE = {
  工程类型: 'select', 施工距离: 'select2', 施工调遣分类: 'select3', 冬雨季施工费: 'select4',
  施工折扣: 'number', 施工实际里程: 'number', 施工现场海拔: 'number', 甲供增值税: 'number', 乙供增值税: 'number',
};
const GROUPS = [
  { title: '基本信息', fields: ['建设项目名称', '单项工程名称', '单段工程名称', '项目编号', '表格编号', '合同编号', '工程类型', '施工距离', '施工实际里程', '段落起点', '段落终点', '区县', '施工现场海拔'] },
  { title: '参建单位', fields: ['建设单位', '施工单位', '设计单位', '监理单位'] },
  { title: '编制信息', fields: ['编制', '审核', '编制日期', '工程负责人'] },
  { title: '取费与折扣', fields: ['施工折扣', '冬雨季施工费', '施工调遣分类', '甲供增值税', '乙供增值税'] },
];

export default function WorkbenchInfo({ db, project, profile, setInfo, setName, setRateOverride, setTable5Override, onSwitchProfile }) {
  const [discountHint, setDiscountHint] = useState(false);
  const lastRateRef = useRef(null);
  const discount = project.info?.施工折扣;
  if (typeof discount === 'number' && discount !== 1) lastRateRef.current = discount;
  const option = discountOption(project.info);
  const manualFees = (profile?.table5Fees || []).filter((f) => f.basis === 'manual');
  const t5Override = (key) => (project.table5Overrides || []).find((o) => o.key === key) || {};
  const vatCfg = profile?.rates?.vatRates || {};

  const renderField = (k) => {
    const type = FIELD_TYPE[k] || 'text';
    const selectOpts = type === 'select' ? PROJECT_TYPES
      : type === 'select2' ? ['35KM以内', '35KM以上']
      : type === 'select3' ? ['施工队伍调遣人数(线路、管道）', '施工队伍调遣人数(无线、电源、设备）']
      : type === 'select4' ? ['Ⅰ类地区', 'Ⅱ类地区', 'Ⅲ类地区'] : null;
    return (
      <label key={k} className="form-field">{k === '工程类型' ? '工程类别' : k}
        {selectOpts ? (
          <select className="input" value={project.info[k] ?? ''} onChange={(e) => setInfo(k, e.target.value)}>
            {selectOpts.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        ) : (
          <input className="input" type={type === 'number' ? 'number' : 'text'} step="any"
            value={project.info[k] ?? ''} onChange={(e) => setInfo(k, type === 'number' ? Number(e.target.value) : e.target.value)} />
        )}
      </label>
    );
  };

  return (
    <div>
      <label className="form-field">工程名称（列表显示）
        <input className="input" style={{ fontSize: 16, fontWeight: 700 }} value={project.name}
          onChange={(e) => setName(e.target.value)} />
      </label>
      {GROUPS.map((g) => (
        <div key={g.title} className="card" style={{ marginTop: 12 }}>
          <h3>{g.title}</h3>
          <div className="form-grid">
            {g.fields.map(renderField)}
            {g.title === '取费与折扣' && (
              <>
                <label className="form-field">取费标准（配置方案）
                  <select className="input" value={project.profileId}
                    onChange={(e) => {
                      const target = (db.configurationProfiles || []).find((x) => x.id === e.target.value);
                      if (target && target.id !== project.profileId) onSwitchProfile(target.id, target.name);
                    }}>
                    {(db.configurationProfiles || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <div className="form-field">打折选项
                  <span>
                    <label><input type="radio" name="discountOption" checked={option === 'discount'}
                      onChange={() => {
                        const { info, needsInput } = applyDiscountOption(project.info, 'discount', lastRateRef.current ?? profile?.discountRule?.discountRate);
                        if (needsInput) { setDiscountHint(true); return; }
                        setDiscountHint(false);
                        setInfo('施工折扣', info.施工折扣);
                      }} /> 打折</label>{' '}
                    <label><input type="radio" name="discountOption" checked={option === 'noDiscount'}
                      onChange={() => { setDiscountHint(false); setInfo('施工折扣', 1); }} /> 不打折</label>
                  </span>
                  {discountHint && <span className="muted">请在“施工折扣”输入框输入折扣率（&lt;1，如 0.379）。</span>}
                  <span className="muted">施工折扣 1 = 不打折；0.379 = 打 37.9%（主材费、规费不打折）。</span>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
      <div className="card" style={{ marginTop: 12 }}>
        <h3>增值税覆盖（本工程）</h3>
        <p className="muted">为空 = 用配置值；清空即恢复配置值。优先级：本工程覆盖 &gt; 工程信息 &gt; 配置方案。</p>
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
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3>表五单项覆盖（本工程）</h3>
        {manualFees.length ? manualFees.map((f) => (
          <label key={f.key} className="form-field">{f.name}（手动填）
            <input className="input" type="number" step="any" placeholder="为空 = 用配置"
              value={t5Override(f.key).amount ?? ''}
              onChange={(e) => setTable5Override(f.key, 'amount', e.target.value === '' ? null : Number(e.target.value))} />
            <span><input type="checkbox" checked={t5Override(f.key).enabled ?? true}
              onChange={(e) => setTable5Override(f.key, 'enabled', e.target.checked)} /> 启用</span>
          </label>
        )) : <p className="muted">当前配置无手动填项。</p>}
      </div>
    </div>
  );
}
