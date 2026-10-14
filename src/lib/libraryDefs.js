/**
 * 库视图定义（v2 增量 4，纯函数，无 Electron / DOM 依赖）。
 *
 * 11 个管理视图覆盖 10 张存储表：rules 一张存储表拆为两个视图
 * （rulesVariant = 定额—材料映射，kind ∈ {变体, 变体*, 通用}；
 *  rulesAlt = 关联规则，kind === 备选）。rates 视图展开 rates.byProjectType
 * + winterTable + vatRates；其余视图直接对应 profile.libraries 的一张表。
 * 列定义 type：text | number | select | checkbox | readonly。
 */
import { uid } from './profiles.js';
import { RATE_FIELD_DEFS, PROJECT_TYPES } from '../engine/rates.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));

const text = (key, label, opts = {}) => ({ key, label, type: 'text', ...opts });
const num = (key, label, opts = {}) => ({ key, label, type: 'number', ...opts });
const sel = (key, label, options, opts = {}) => ({ key, label, type: 'select', options, ...opts });
const chk = (key, label, opts = {}) => ({ key, label, type: 'checkbox', ...opts });
const ro = (key, label, opts = {}) => ({ key, label, type: 'readonly', ...opts });

const SUPPLY_OPTS = ['甲供', '乙供', '设备'];
const KIND_ALL = ['变体', '变体*', '通用', '备选'];
const BASIS_OPTS = ['manual', 'preDiscountExclTax', 'afterDiscountExclTax', 'laborTotal', 'fixed', 'surveyKm', 'sum'];

/** 直接对应 libraries 一张表的视图的通用 getRows/setRows。 */
function directView(storage, filter) {
  return {
    getRows(profile) {
      const rows = (profile?.libraries?.[storage] || []).map((r) => ({ ...r }));
      return filter ? rows.filter(filter) : rows;
    },
    setRows(profile, rows) {
      const next = clone(profile);
      if (!next.libraries) next.libraries = {};
      const fixed = (rows || []).map((r) => ({ ...r, id: r.id || uid() }));
      if (!filter) {
        next.libraries[storage] = fixed;
      } else {
        // 只替换属于本视图的切片（按 filter 归属），不触碰另一视图的行。
        const rest = (next.libraries[storage] || []).filter((r) => !filter(r));
        next.libraries[storage] = [...rest, ...fixed];
      }
      next.updatedAt = new Date().toISOString();
      return next;
    },
  };
}

/** 费率视图：getRows 展开 rates；setRows 按 _section/_key 写回。 */
const ratesView = {
  /** 由（工程类型，费率项目）反查 _section/_type/_key；未知项目返回 null（导入时归入错误组）。 */
  resolveRateIdentity(row) {
    const type = row?.['工程类型'];
    const item = row?.['费率项目'];
    if (type === '冬雨季表') {
      const m = /^冬雨季施工增加费（(.+)）$/.exec(item || '');
      if (m && ['Ⅰ类地区', 'Ⅱ类地区', 'Ⅲ类地区'].includes(m[1])) {
        return { _section: 'winterTable', _type: m[1], _key: m[1] };
      }
      return null;
    }
    if (type === '增值税率') {
      const map = {
        甲供材料增值税率: 'jiaTax', 乙供材料增值税率: 'yiTax',
        销项税额税率: 'outputTax', 安全生产费增值税率: 'safetyVat',
      };
      if (map[item]) return { _section: 'vatRates', _type: map[item], _key: map[item] };
      return null;
    }
    if (PROJECT_TYPES.includes(type)) {
      const def = RATE_FIELD_DEFS.find((d) => d.name === item);
      if (def) return { _section: 'byProjectType', _type: type, _key: def.key };
    }
    return null;
  },
  getRows(profile) {
    const rates = profile?.rates || {};
    const rows = [];
    for (const t of PROJECT_TYPES) {
      const row = rates.byProjectType?.[t] || {};
      for (const def of RATE_FIELD_DEFS) {
        rows.push({
          id: `rate:${t}:${def.key}`,
          工程类型: t, 费率项目: def.name, 数值: row[def.key] ?? null, 单位: def.unit,
          _section: 'byProjectType', _type: t, _key: def.key,
        });
      }
    }
    for (const region of ['Ⅰ类地区', 'Ⅱ类地区', 'Ⅲ类地区']) {
      rows.push({
        id: `rate:winter:${region}`,
        工程类型: '冬雨季表', 费率项目: `冬雨季施工增加费（${region}）`,
        数值: rates.winterTable?.[region] ?? null, 单位: '费率',
        _section: 'winterTable', _type: region, _key: region,
      });
    }
    for (const [key, name] of [
      ['jiaTax', '甲供材料增值税率'], ['yiTax', '乙供材料增值税率'],
      ['outputTax', '销项税额税率'], ['safetyVat', '安全生产费增值税率'],
    ]) {
      rows.push({
        id: `rate:vat:${key}`,
        工程类型: '增值税率', 费率项目: name,
        数值: rates.vatRates?.[key] ?? null, 单位: '费率',
        _section: 'vatRates', _type: key, _key: key,
      });
    }
    return rows;
  },
  setRows(profile, rows) {
    const next = clone(profile);
    if (!next.rates) next.rates = { byProjectType: {}, winterTable: {}, vatRates: {} };
    if (!next.rates.byProjectType) next.rates.byProjectType = {};
    if (!next.rates.winterTable) next.rates.winterTable = {};
    if (!next.rates.vatRates) next.rates.vatRates = {};
    for (const r of rows || []) {
      // 数值为空（'' / null / undefined）= null：冬雨季 winterRate 的 null = 按地区查表，禁止写成 0。
      const v = r.数值 === '' || r.数值 == null ? null : Number(r.数值);
      if (r._section === 'byProjectType') {
        if (!next.rates.byProjectType[r._type]) next.rates.byProjectType[r._type] = {};
        next.rates.byProjectType[r._type][r._key] = v;
      } else if (r._section === 'winterTable') {
        next.rates.winterTable[r._key] = v;
      } else if (r._section === 'vatRates') {
        next.rates.vatRates[r._key] = v;
      }
    }
    next.updatedAt = new Date().toISOString();
    return next;
  },
};

export const LIBRARY_VIEWS = [
  {
    key: 'quotas', label: '定额库', storage: 'quotas',
    columns: [
      text('code', '定额编号', { required: true }), text('name', '定额名称', { required: true }),
      text('unit', '单位'), num('tech', '技工/单位'), num('labor', '普工/单位'),
      num('coef', '系数'), text('book', '分册'), text('alias', '别名'),
    ],
    businessKey: ['code'], allowAdd: true, allowDelete: true, selectable: true,
    ...directView('quotas'),
    newRow: () => ({ id: uid(), code: '', name: '', unit: '', tech: 0, labor: 0, coef: 1, book: '', alias: '' }),
  },
  {
    key: 'shortlist', label: '常用短单', storage: 'shortlist',
    columns: [
      text('code', '定额编号', { required: true }), text('name', '定额名称', { required: true }),
      text('unit', '单位'), num('coef', '系数'),
    ],
    businessKey: ['code', 'name'], allowAdd: true, allowDelete: true, selectable: true,
    ...directView('shortlist'),
    newRow: () => ({ id: uid(), code: '', name: '', unit: '', coef: 1 }),
  },
  {
    key: 'materials', label: '材料库', storage: 'materials',
    columns: [
      text('name', '名称', { required: true }), text('spec', '规格'),
      text('unit', '单位'), num('priceExcl', '除税单价'),
      sel('supply', '供货', SUPPLY_OPTS), text('remark', '备注'),
    ],
    businessKey: ['name', 'spec'], allowAdd: true, allowDelete: true, selectable: true,
    ...directView('materials'),
    newRow: () => ({ id: uid(), name: '', spec: '', unit: '', priceExcl: 0, supply: '甲供', remark: '' }),
  },
  {
    key: 'rulesVariant', label: '定额—材料映射', storage: 'rules',
    columns: [
      text('quota', '定额编号', { required: true }), text('material', '材料', { required: true }),
      text('spec', '规格'), text('unit', '单位'), num('consumption', '单位消耗量'),
      sel('supply', '供货', SUPPLY_OPTS), sel('kind', '类型', ['变体', '变体*', '通用']),
      text('variant', '变体项目名称'), text('remark', '备注'), text('appliesTo', '适用工程'),
    ],
    businessKey: ['quota', 'material', 'spec', 'kind', 'variant'],
    allowAdd: true, allowDelete: true, selectable: true,
    ...directView('rules', (r) => ['变体', '变体*', '通用'].includes(r.kind)),
    newRow: () => ({ id: uid(), quota: '', material: '', spec: '', unit: '', consumption: 0, supply: '甲供', kind: '变体', variant: '', remark: '', appliesTo: '全' }),
  },
  {
    key: 'rulesAlt', label: '关联规则（备选）', storage: 'rules',
    columns: [
      text('quota', '定额编号', { required: true }), text('material', '材料', { required: true }),
      text('spec', '规格'), text('unit', '单位'), num('consumption', '单位消耗量'),
      sel('supply', '供货', SUPPLY_OPTS), sel('kind', '类型', ['备选']),
      text('variant', '变体项目名称'), text('remark', '备注'), text('appliesTo', '适用工程'),
    ],
    businessKey: ['quota', 'material', 'spec', 'kind', 'variant'],
    allowAdd: true, allowDelete: true, selectable: true,
    ...directView('rules', (r) => r.kind === '备选'),
    newRow: () => ({ id: uid(), quota: '', material: '', spec: '', unit: '', consumption: 0, supply: '甲供', kind: '备选', variant: '', remark: '', appliesTo: '全' }),
  },
  {
    key: 'machinePrices', label: '机械库', storage: 'machinePrices',
    columns: [
      text('code', '机械编号', { required: true }), text('name', '机械名称', { required: true }),
      text('unit', '单位'), num('price', '台班单价'),
    ],
    businessKey: ['code'], allowAdd: true, allowDelete: true, selectable: true,
    ...directView('machinePrices'),
    newRow: () => ({ id: uid(), code: '', name: '', unit: '台班', price: 0 }),
  },
  {
    key: 'instrumentPrices', label: '仪器仪表库', storage: 'instrumentPrices',
    columns: [
      text('code', '仪表编号', { required: true }), text('name', '仪表名称', { required: true }),
      text('unit', '单位'), num('price', '台班单价'),
    ],
    businessKey: ['code'], allowAdd: true, allowDelete: true, selectable: true,
    ...directView('instrumentPrices'),
    newRow: () => ({ id: uid(), code: '', name: '', unit: '台班', price: 0 }),
  },
  {
    key: 'quotaMachines', label: '定额—机械映射', storage: 'quotaMachines',
    columns: [
      text('quota', '定额编号', { required: true }), text('mcode', '机械编号', { required: true }),
      text('mname', '机械名称'), text('unit', '单位'), num('qty', '数量(台班)'),
    ],
    businessKey: ['quota', 'mcode'], allowAdd: true, allowDelete: true, selectable: true,
    ...directView('quotaMachines'),
    newRow: () => ({ id: uid(), quota: '', mcode: '', mname: '', unit: '台班', qty: 0 }),
  },
  {
    key: 'quotaInstruments', label: '定额—仪表映射', storage: 'quotaInstruments',
    columns: [
      text('quota', '定额编号', { required: true }), text('mcode', '仪表编号', { required: true }),
      text('mname', '仪表名称'), text('unit', '单位'), num('qty', '数量(台班)'),
    ],
    businessKey: ['quota', 'mcode'], allowAdd: true, allowDelete: true, selectable: true,
    ...directView('quotaInstruments'),
    newRow: () => ({ id: uid(), quota: '', mcode: '', mname: '', unit: '台班', qty: 0 }),
  },
  {
    key: 'rates', label: '表二费率', storage: 'rates',
    columns: [
      ro('工程类型', '工程类型'), ro('费率项目', '费率项目'),
      num('数值', '数值'), ro('单位', '单位'),
    ],
    businessKey: ['工程类型', '费率项目'], allowAdd: false, allowDelete: false, selectable: false,
    ...ratesView,
    newRow: () => null,
  },
  {
    key: 'table5Fees', label: '表五费用', storage: 'table5Fees',
    columns: [
      text('key', '费用 key', { required: true }), text('name', '费用名称', { required: true }),
      sel('basis', '取费依据', BASIS_OPTS), num('rate', '费率'),
      num('vatRate', '增值税率'), num('amount', '固定金额'),
      chk('enabled', '启用'), num('order', '序号'), text('note', '备注'),
    ],
    businessKey: ['key'], allowAdd: true, allowDelete: true, selectable: true,
    getRows(profile) { return (profile?.table5Fees || []).map((r) => ({ ...r })); },
    setRows(profile, rows) {
      const next = clone(profile);
      next.table5Fees = (rows || []).map((r) => ({ ...r, id: r.id || uid() }));
      next.updatedAt = new Date().toISOString();
      return next;
    },
    newRow: () => ({ id: uid(), key: '', name: '新费用项', basis: 'manual', rate: 0, vatRate: 0, amount: null, enabled: true, order: 99, note: '' }),
  },
];

export const LIBRARY_VIEW_MAP = Object.fromEntries(LIBRARY_VIEWS.map((v) => [v.key, v]));

/** 供 select 列校验：kind 枚举（规则两视图共用）。 */
export const RULE_KIND_OPTIONS = KIND_ALL;
