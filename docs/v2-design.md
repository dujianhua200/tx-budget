# 通信概预算 App v2 设计文档

- 版本：v2-design v1.0（第 1 阶段交付物，仅设计，不含代码改动）
- 编写日期：2026-10-14
- 依据（已通读，非凭想象）：
  - `docs/print-layout-spec.md`（316 行）+ `docs/print-layout-spec.raw.json`（11 张表机器可读提取，488,384 字符）
  - `src/engine/calc.mjs`（400 行）、`electron/main.cjs`（126 行）、`electron/excel.cjs`（167 行）、`electron/preload.cjs`（12 行）
  - `src/App.jsx`、`src/pages/Projects.jsx` / `ProjectDetail.jsx` / `Batch.jsx` / `Settings.jsx`、`src/lib/store.js`、`src/styles.css`
  - `data/seed.json`（结构抽样：定额 2622、短单 165、甲供材料 175、乙供材料 0、设备材料 1、规则 117、机械单价 59、仪表单价 98、定额—机械映射 1533、定额—仪表映射 1685、费率矩阵 85 行）
  - `tests/engine.test.mjs`（12 断言）、`tests/crosscheck.test.mjs`（29 断言）、`tests/excel.test.mjs`（13 断言）、`package.json`（v1.0.0）
  - 参考结算书 `~/workspace/user/files/2024__________________31_-9MA24CE0000019.xls`（已用 LibreOffice 转 xlsx 到 `/tmp/bt-ref` 实测核对，见附录 A）
- 约束：本文档只写 `docs/v2-design.md` 一个文件；不改代码、不 push、不打 tag、不触发构建、不动 Release、不 commit。
- 阅读约定：本文用“v1”指现有代码；“参考文件”指上述 2024 联通结算书；金额单位均为元，工日保留 2 位小数，金额 `ROUND(x,2)` 与 Excel 一致。

---

## 1. 版本增量与发布流程（后续各阶段的约定，本节优先于一切实施细节）

v2 按增量实施，**每个增量都必须先架构、后代码；先自验、后交付；实施方不自行发布**。违反本节的改动一律视为无效改动，必须补架构说明后重新评审。

### 1.1 增量划分（建议顺序，后续阶段按此切分）

| 增量 | 内容 | 对应本文章节 |
|---|---|---|
| 增量 1 | 数据模型 + 多配置方案 + v1→v2 迁移 | §2、§4 |
| 增量 2 | 计算引擎口径：打折模型、安全生产费、汇总表口径、表五可配置 | §6、§7、§3.1 |
| 增量 3 | 打印导出（11 张表按版式规格生成） | §5 |
| 增量 4 | 库管理 + 批量操作（导入差异预览 / 导出 / 批量删除） | §8、§3 |
| 增量 5 | 单工程工作台 + v1 QA 问题修复（B1–B9） | §9、§10 |
| 增量 6 | 测试与验收（新测试 + LibreOffice 重算 + 参考结算书逐项对数） | §12 |

增量之间可并行写设计，但代码实施按增量顺序串行；后一增量不得绕过前一增量的接口。

### 1.2 每个增量开始前：先写架构，再动手写代码

- 实施该增量前，先在本设计文档中以“增量 N 架构补充”小节写清：**数据模型**（新增/改动的字段与 JSON 结构）、**模块划分**（改哪些文件、新哪些文件）、**接口**（函数签名、IPC 通道、组件 props）、**影响面**（哪些旧功能、旧测试、旧数据会被触及）。
- 不做无架构的临时改动：**禁止**“先改一行代码看看效果”“临时写死一个值下次再改”“先绕过测试以后再补”。任何看似小的改动，只要触及数据模型、计算口径、导出格式、存储格式，就必须先补架构说明。
- 架构补充写进本文档的方式：**追加**，不改写历史。每个增量补充独立成节，标题形如 `## 增量 N 架构补充（YYYY-MM-DD）`，放在附录 C 之前；已发布的章节不删除、不覆盖，只在补充中注明“ supersedes §x.y”。
- 架构补充的评审标准：另一个人（或主代理）只读补充节就能复述出“改什么文件、接口是什么、旧数据怎么办、怎么验证”，否则视为没写清，打回重写。

### 1.3 每个增量结束时：附变更记录

每个增量交付时，在本文档附录 C《变更记录》中追加一条，字段固定：

```
### 增量 N（YYYY-MM-DD，实施者）
- 改了什么：文件列表 + 每个文件的改动一句话。
- 为什么：对应的需求 / QA 问题编号 / 口径依据（引用本文章节或参考文件页/表）。
- 验证证据：测试命令 + 通过数（如 `npm test` 12+29+13 通过，新增测试 X/Y）、
  LibreOffice 重算结果（如有）、参考结算书对数项（如有）。
- 已知遗留：未解决的问题 + 归属的后续增量 / 未决问题编号。
```

没有变更记录的增量视为未交付；变更记录中的“验证证据”不许写“已自测”“感觉没问题”，必须给可复现的命令与数字。

### 1.4 增量达到可发布状态后：作为发布候选交回，不自行发布

- 增量自验通过后，实施方**只交回发布候选**：变更记录 + 构建产物位置（如有）+ 验证证据，**不由实施方自己 push、打 tag、触发构建、动 Release**。
- 发布动作（push / 打 tag / 触发 CI / 动 Release / 发版）由**主代理核验后执行**。主代理核验不过，发布候选打回，实施方继续修，不许绕过主代理自行发版。
- 发布候选的命名：`v2-增量N-发布候选-YYYYMMDD`（仅用于沟通，不作为 git tag；真正的版本号/tag 由主代理在发布时定）。

### 1.5 每个版本发布前：必须过自体验 QA，有问题先修完再发布

发布前自体验 QA 三项缺一不可，全部通过才允许进入发布候选：

1. **代码级**：`npm test` 全量通过（含新增测试）；`npm run build` 通过；无新增 `console.error` / 未处理 Promise。
2. **导出回读**：用发布候选构建的 App（或 `electron/excel.cjs` + 新打印导出）导出至少一个真实工程的预算书，再用 LibreOffice / ExcelJS 读回，逐项核对数值与版式（见 §12.3），不许只看“导出成功”提示。
3. **结算书对数**：用参考结算书样本数据（附录 A 锚点值）逐项对数（见 §12.4），版式 + 数值双重验收，差值超过容差（金额 0.02 元，工日 0.011）即为失败。
- 自体验 QA 中发现的任何问题，**先修完、再发布**：不许带着已知问题发版、不许把问题推给“用户验收时再看”、不许用“下个版本修”代替本版本修复。修完后三项 QA 重新完整跑一遍，不许只跑其中一项。
- 自体验 QA 的执行人必须是实施方自己（按真实用户流程点按操作），不是只跑自动化测试。点按走查受阻（如远程浏览器打不开本地服务）时，推迟发布，不搭临时旁路（如内网穿透）绕过走查——v1 阶段已有此先例。

---

## 2. 数据模型

### 2.1 v1 现状（实测，非推测）

`electron/main.cjs` `defaultDb()` / `loadDb()`：

```js
// v1 db（version: 1）
{
  version: 1,
  libraries: {                 // 全局唯一一套库，所有工程共用
    quotas: [],                // 定额库：{code, name, unit, tech, labor, coef, book, alias}
    shortlist: [],             // 常用短单：{code, name, unit, coef}（165 行）
    materials: [],             // 材料库：{id, name, spec, unit, priceExcl, supply('甲供'|'乙供'|'设备'), remark}
    rules: [],                 // 关联规则：{id, quota, material, spec, unit, consumption, supply, kind('变体'|'变体*'|'通用'|'备选'), variant, remark}
    rateGrid: [[]],            // 费率矩阵：85 行二维数组，列 G..K 对应 5 类工程，行号靠 HLOOKUP n 定位（魔法下标，见 §10 B8）
    winterTable: {},           // {Ⅰ类地区, Ⅱ类地区, Ⅲ类地区}
    machinePrices: [],         // {code, name, unit, price}
    instrumentPrices: [],      // {code, name, unit, price}
    quotaMachines: [],         // {quota, mcode, mname, unit, qty}
    quotaInstruments: [],      // {quota, mcode, mname, unit, qty}
  },
  projects: [],                // 工程数组（见 §2.3）
  settings: {
    company: '',
    defaultInfo: { 工程类型, 施工折扣, 施工距离, 施工调遣分类, 冬雨季施工费, 甲供增值税, 乙供增值税 },
  },
}
```

v1 的核心缺陷：**只有一套库**。改费率/定额即影响全部工程；无法为不同工程、不同业主、不同年份保存多套取费方案；配置导出是整库 JSON 且走浏览器下载冒充（B1）。

### 2.2 v2 db 结构（完整 JSON 骨架）

```js
// v2 db（version: 2）
{
  version: 2,
  configurationProfiles: [     // §2.2.1：配置方案数组，至少 1 条
    { /* ConfigurationProfile，见 §2.2.1 */ }
  ],
  projects: [                  // 工程数组，见 §2.3
    { /* Project，见 §2.3 */ }
  ],
  settings: {
    company: '',               // 建设/编制单位默认名（沿用 v1）
    activeProfileId: 'prof_default', // 新建工程默认使用的配置方案 id
    defaultInfo: {             // 新建工程默认工程信息（沿用 v1，字段见 calc.mjs DEFAULT_INFO）
      工程类型: '通信线路工程', 施工折扣: 1, 施工距离: '35KM以内',
      施工调遣分类: '施工队伍调遣人数(线路、管道）',
      冬雨季施工费: 'Ⅲ类地区', 甲供增值税: 0.13, 乙供增值税: 0.09,
    },
  },
  // v1 备份：仅在迁移时写入一次，之后永不覆盖（见 §4.3）
  v1Backup: null | { migratedAt: '', v1Db: { /* 完整 v1 db 原样 */ } },
  // 废弃：v2 不再使用顶层 libraries；如残留旧字段，加载时忽略并警告
}
```

关键决策：

- **顶层 `libraries` 删除**，库全部收进各配置方案内。任何代码不得再读 `db.libraries`（`store.js` `calcLibs` 改为按工程 `profileId` 解析，见 §3.1）。
- `settings.defaultInfo` 保留，但其中的费率类默认值（甲供/乙供增值税、施工折扣）只是“新建工程的初始值”，**计算时以工程所属配置方案的费率 + 工程自身的 `rateOverrides` 为准**（优先级见 §2.4）。
- `seed.json` 文件本身**不改格式**（仍是 v1 形状的种子），由迁移/初始化转换函数 `seedToProfile(seed, name)` 转成默认配置方案（见 §4.2）。这样种子与母版提取流程不受影响。

### 2.2.1 ConfigurationProfile（配置方案）

每套命名配置拥有**独立完整**的一套库、费率、规则。不同方案之间数据完全隔离，互不影响。

```js
{
  id: 'prof_default',          // string，uid() 生成，全局唯一，不可修改
  name: '默认配置',             // string，用户可改；迁移生成的方案固定叫“默认配置”
  description: '',             // string，用户备注（如“2024 联通信阳口径”）
  createdAt: 'ISO 时间', updatedAt: 'ISO 时间',
  source: 'migrated-v1' | 'seed' | 'user-created' | 'imported', // 来源，用于排查
  isBuiltIn: false,            // true = 系统内置（仅“默认配置”迁移产物可为 true，禁止删除时需检查）

  libraries: {
    quotas: [                  // 定额库
      { id: '', code: '', name: '', unit: '', tech: 0, labor: 0, coef: 1, book: '', alias: '' }
    ],
    shortlist: [               // 常用短单（工程量快速添加用）
      { id: '', code: '', name: '', unit: '', coef: 1 }
    ],
    materials: [               // 材料库（甲供/乙供/设备同表，以 supply 区分）
      { id: '', name: '', spec: '', unit: '', priceExcl: 0, supply: '甲供'|'乙供'|'设备', remark: '' }
    ],
    rules: [                   // 定额—材料关联规则
      { id: '', quota: '', material: '', spec: '', unit: '', consumption: 0,
        supply: '甲供'|'乙供'|'设备', kind: '变体'|'变体*'|'通用'|'备选',
        variant: '', remark: '', appliesTo: '' }
        // appliesTo：适用工程标记（沿用母版“适用工程”语义：'' = 不启用，'全' = 全部工程，'1,3' = 仅工程序号 1,3）；
        // v1 seed 的 rules[].remark 中含“一号多材…适用工程…”说明文字，迁移时不解析，只原样保留 remark，
        // appliesTo 默认 '全'；后续增量如需按适用工程过滤，再在架构补充中定义。
    ],
    machinePrices: [           // 机械台班单价库
      { id: '', code: '', name: '', unit: '台班', price: 0 }
    ],
    instrumentPrices: [        // 仪表台班单价库
      { id: '', code: '', name: '', unit: '台班', price: 0 }
    ],
    quotaMachines: [           // 定额—机械映射
      { id: '', quota: '', mcode: '', mname: '', unit: '台班', qty: 0 }
    ],
    quotaInstruments: [        // 定额—仪表映射
      { id: '', quota: '', mcode: '', mname: '', unit: '台班', qty: 0 }
    ],
  },

  rates: {                     // 表二费率（具名字段，替代 v1 rateGrid 魔法下标，见 §10 B8）
    byProjectType: {           // key = PROJECT_TYPES 五类工程之一
      '通信线路工程': {
        techPrice: 114,        // 技工费，元/工日
        laborPrice: 61,        // 普工费，元/工日
        auxRate: 0.003,        // 辅助材料费率（线路工程 0.3%）
        envRate: 0,            // 环境保护费费率
        civilRate: 0.015,      // 文明施工费费率
        carryRate: 0.034,      // 工地器材搬运费费率
        disturbRate: 0.06,     // 工程干扰费费率
        handoverRate: 0.033,   // 工程点交、场地清理费费率
        tempNearRate: 0.026,   // 临时设施费（35km 以内）
        tempFarRate: 0.05,     // 临时设施费（35km 以上）
        vehicleRate: 0.05,     // 工程车辆使用费费率
        nightRate: 0.025,      // 夜间施工增加费费率
        winterRate: null,      // 冬雨季费率：null = 按 winterTable + 地区类别查（见下）；非 null = 直接用该值覆盖
        toolRate: 0.015,       // 生产工具用具使用费费率
        utilityRate: 0,        // 施工用水电蒸汽费费率（v1 矩阵中为 null，迁移为 0）
        protectRate: 0.02,     // 已完成工程及设备保护费费率
        socialRate: 0.285,     // 社会保障费费率
        housingRate: 0.0419,   // 住房公积金费率
        accidentRate: 0.01,    // 危险作业意外伤害保险费费率
        mgmtRate: 0.274,       // 企业管理费费率
        profitRate: 0.2,       // 利润率
      },
      // 其余四类工程（无线 / 电源 / 有线设备 / 管道）结构相同，数值按 rateGrid 对应列迁移
    },
    winterTable: { 'Ⅰ类地区': 0.036, 'Ⅱ类地区': 0.025, 'Ⅲ类地区': 0.018 },
    vatRates: {                // 增值税率（全局费率页可见可改，见 §10 B8）
      jiaTax: 0.13,            // 甲供材料增值税率
      yiTax: 0.09,             // 乙供材料增值税率（同时是销项税额基数税率，见 §7）
      outputTax: 0.09,         // 销项税额税率（v1 隐式 = 乙供增值税；v2 显式独立，默认与 yiTax 同值）
      safetyVat: 0,            // 安全生产费增值税率（§7 已定：0）
    },
  },

  discountRule: {              // 打折规则（随配置方案保存与导出，见 §6）
    discountRate: 1,           // 折扣率：1 = 不打折；0.379 = 打 37.9%（参考样本值）
    noDiscountKeys: [          // 不打折费用项 key 清单（见 §6.2，默认清单见 §6.2）
      'mainMat', 'auxMat', 'civilFee', 'regFee', 'socialFee', 'housingFee', 'accidentFee', 'safetyFee',
    ],
    zeroAfterDiscountKeys: [   // 折后=0 费用项 key 清单（见 §6.2，Q2 裁决 b）
      'carryFee', 'disturbFee', 'tempFee', 'nightFee', 'winterFee', 'utilityFee',
      'specialFee', 'protectFee', 'earthFee', 'dispatchFee', 'bigMachineFee',
    ],
    methodText: {              // 折后表“依据和计算方法”列模板（见 §6.4），占位符 {rate} = 折扣率百分比
      discounted: '{base}X{rate}%',
      restored: '{base}/{rate}%',
    },
  },

  table5Fees: [                // 表五费用项（可配置，见 §7.3）
    { key: 'safetyFee', name: '安全生产费', basis: 'preDiscountExclTax',
      rate: 0.02, vatRate: 0, enabled: true, order: 8, note: '财资〔2022〕136号，通信工程 2%，增值税 0' },
    // 其余 13 项见 §7.3；basis 可选 'preDiscountExclTax' | 'exclTax' | 'laborTotal' | 'fixed' | 'manual'
  ],

  dispatch: {                  // 调遣费参数（v1 硬编码在 calc.mjs 的 DISPATCH_* 常量，v2 收进配置）
    priceTable: [[0, 0], [35.0001, 141], [100.0001, 174], /* …同 v1 DISPATCH_PRICE… */],
    peopleEquip: [[0, 5], [500.0001, 10], /* …同 v1 DISPATCH_PEOPLE_EQUIP… */],
    peopleLine: [[0, 5], [500.0001, 10], /* …同 v1 DISPATCH_PEOPLE_LINE… */],
    extraPer200km: 48,         // 里程 > 4400km 后每 200km 追加单价
    extraPeopleStep: 3,        // 超阈值后每步追加人数
  },
}
```

字段说明要点：

- 全部库表行都带稳定 `id`（`uid()` 生成）。v1 的 quotas / quotaMachines / quotaInstruments / shortlist / machinePrices / instrumentPrices 没有 `id`，迁移时补生成（见 §4.2）；此后**一切改/删操作按 `id` 定位，不许按编号首条匹配**（B7，见 §10）。
- `rates.byProjectType` 的 key 必须是 `PROJECT_TYPES` 五类之一；未知工程类型时引擎返回 0 并记入 `result.warnings`，不许静默按第一类计算。
- `rates.winterRate: null` 的语义是“查 winterTable”，与“费率为 0”不同，禁止把 null 存成 0。
- `discountRule.noDiscountKeys` 的 key 取值范围由 `src/engine/discount.mjs` 的 `DISCOUNT_LINE_DEFS` 定义（见 §6.2），配置页只允许从该枚举中勾选，不许手写自由文本。
- `table5Fees[].basis` 枚举见 §7.3；`fixed` = 固定金额（`amount` 字段），`manual` = 每工程手工填（`project.table5Overrides`，见 §2.3）。

### 2.3 工程记录（Project）

```js
{
  id: '', name: '', createdAt: '', updatedAt: '',
  profileId: 'prof_default',   // ★ v2 新增：本工程使用的配置方案 id；必填
  info: { /* 沿用 v1 DEFAULT_INFO 字段；见 §2.4 优先级 */ },
  quantities: [                // 工程量行：v2 新增稳定行 id
    { id: '', quota: '', variant: '', unit: '', qty: 0, coef: 1 }
  ],
  materialAdjust: [ { key: '', delta: 0 } ],              // 材料数量手动调整（沿用 v1）
  materialPriceOverrides: [ { key: '', priceExcl: 0 } ], // 本工程材料单价覆盖（沿用 v1）
  ruleOverrides: [ { ruleId: '', enabled: false } ],      // 备选规则启用（沿用 v1）
  rateOverrides: {             // 本工程费率覆盖（v1 已有零散字段，v2 显式收拢；全部可选）
    discount: null,            // 施工折扣覆盖（null = 用 profile.discountRule.discountRate）
    jiaTax: null, yiTax: null, outputTax: null, safetyVat: null,
    taxRate: null,             // 兼容字段：v1 语义 = 乙供增值税；v2 写入时同步 yiTax + outputTax，读取时 yiTax 优先
  },
  table5Overrides: [ { key: '', amount: null, enabled: null } ], // 本工程表五单项覆盖（v2 新增；null = 用配置）
  warningsDismissed: [],       // 用户已确认忽略的警告 id 列表（B7 孤儿警告可逐条忽略，忽略记录留痕）
}
```

- `profileId` 是工程与配置的唯一关联。工程列表页展示配置方案名；切换工程的配置方案 = 改 `profileId` + 重新计算（切换前若目标方案与当前方案的库差异会导致结果变化，必须弹窗提示“切换配置将重新计算，结果可能变化”并确认）。
- `quantities[].id` 是 B7 修复的基础：删除/改动按 `id` 定位；导入时若同一 `(quota, variant)` 出现多行，**保留多行**，不许合并（参考文件表三甲中同一编号多行不同变体，如 TXL3-192 出现 3 次）。
- `rateOverrides` 全 null 时，计算全部取配置方案值。`info.施工折扣` 与 `rateOverrides.discount` 的关系：v1 中两者并存（`calc.mjs` 取 `rateOverrides.discount ?? info.施工折扣 ?? 1`）。v2 保留该优先级，但**界面只暴露一个“施工折扣”输入框**，写到 `info.施工折扣`；`rateOverrides.discount` 仅由批量改折扣 / 导入时写入，且写入时同步 `info.施工折扣`，不许两处值不一致且无同步。

### 2.4 取值优先级（计算时）

```
工程 rateOverrides（非 null）> 工程 info（施工折扣 / 甲供增值税 / 乙供增值税）
  > 配置方案 rates / discountRule / table5Fees > 引擎内置兜底（仅用于缺失字段告警场景）
```

- 任何一级缺失字段，引擎不得静默用 0 替代关键费率：缺失时 `result.warnings` 记一条 `missingRate:{key}`，并在工作台顶部以警告条展示；仅当用户明确确认“按 0 计算”后才按 0 算（确认记录进 `warningsDismissed`）。
- `seed.json` 的 `infoDefaults`（含 `施工折扣: 0.51` 等母版残留值）**不作为计算默认值**，仅供迁移时参考；v2 新建工程默认值取 `settings.defaultInfo`（施工折扣 1）。

---

## 3. 模块划分

### 3.1 文件清单：改 / 新 / 删

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/engine/calc.mjs` | 改 | 计算引擎（纯 JS，无依赖）。签名改为 `calcProject(project, libs)`，其中 `libs` 为解析后的方案库（见 §3.1.1）。新增返回 `table2Before` / `table2After`、`table5` 明细行、`warnings[]`。删除 v1 折扣快捷公式与安全生产费 1.5% 公式（见 §6、§7）。 |
| `src/engine/discount.mjs` | 新 | 打折模型纯函数：`applyDiscount(before, rule)`、`DISCOUNT_LINE_DEFS`、`DEFAULT_NO_DISCOUNT_KEYS`。可独立单测，不依赖 calc。 |
| `src/engine/rates.mjs` | 新 | 费率模型：具名费率定义 `RATE_FIELD_DEFS`、v1 `rateGrid` → 具名费率转换 `rateGridToRates(rateGrid)`、`rateForNamed(rates, projectType, key)`、`winterRateForNamed(rates, region)`。 |
| `src/engine/validate.mjs` | 新 | 校验纯函数：`validateQuantities(project, profile)` → `warnings[]`（B7 孤儿行、编号重复、数量异常）；`validateProfile(profile)` → `errors[]`（缺失费率、重复 id、非法枚举）。 |
| `src/engine/printLayout.mjs` | 新 | 打印版式常量：从 `docs/print-layout-spec.raw.json` 提取的每表列宽/行高/合并区/页边距/表尾行号（编译期生成，不在运行时读 raw.json）。导出时按此排版。 |
| `src/lib/store.js` | 改 | `calcLibs(db, project)` 改为按 `project.profileId` 解析方案（`getProfile(db, profileId)` + `profileToLibs(profile)`）；`calcFor(db, project)` 不变签名；`newProject(db, name, template)` 新增 `profileId`（模板的 / `settings.activeProfileId` / 默认）；新增 `uid()` 复用。 |
| `src/lib/profiles.js` | 新 | 配置方案管理纯函数：`createProfile(name, seedLibs)`、`duplicateProfile(profile)`、`seedToProfile(seed, name)`、`migrateV1ToV2(v1db)`、`exportProfile(profile)`（序列化）、`importProfile(json)`（校验 + 新 id）。主进程与渲染进程共用（纯函数，无 Electron 依赖）。 |
| `src/lib/saveQueue.js` | 新 | 保存节流（B3）：`createSaveQueue(saveFn, {delayMs: 800})`，`markDirty(patch)` / `flush()` / `flushSync()`（关闭前强制同步）。 |
| `src/lib/undo.js` | 新 | 撤销栈（B2）：`createUndoStack(limit=50)`，`push(snapshot, label)` / `undo()` / `canUndo()`；快照为受影响的最小范围（单库 / 单工程），不是整库深拷贝。 |
| `src/App.jsx` | 改 | 加载失败错误态 + 重试（B9）；路由新增 `profiles`（配置方案）视图；工作台视图改为 `Workbench`；接入 `saveQueue` + `undo` 上下文。 |
| `src/pages/Projects.jsx` | 改 | 工程列表：新增配置方案列 + 按方案筛选；批量删除走确认 + 撤销（B2）；导出走打印导出 IPC（§5）。 |
| `src/pages/ProjectDetail.jsx` | 删 | 由 `Workbench.jsx` 替代（见 §9）。删除前确认无其他文件 import 它（现仅 `App.jsx` 引用）。 |
| `src/pages/Workbench.jsx` | 新 | 单工程工作台（§9）：工程信息 + 工程量录入 + 计算结果 + 打印导出同页。 |
| `src/pages/Batch.jsx` | 改 | 批量操作：批量新建 / 导入 / 导出（打印版式）/ 改价 / 改折扣 / **批量删除工程**（新增，确认 + 撤销）；改价/改折扣写入 `rateOverrides` 并同步 `info`（§2.3）。 |
| `src/pages/Settings.jsx` | 改 | 由“全局库管理”改为“当前方案库管理”壳：方案选择器 + 各库 Tab（复用 `LibraryTable`）；费率 Tab 改为具名字段表单（B8）；新增打折规则 Tab、表五费用 Tab。 |
| `src/pages/Profiles.jsx` | 新 | 配置方案管理页：列表 / 新建 / 复制 / 重命名 / 删除（占用检查）/ 导出方案文件 / 导入方案文件 / 设为新建默认。 |
| `src/components/LibraryTable.jsx` | 新 | 通用库表组件（§8）：搜索 + 分页/虚拟滚动 + 复选 + 全选 + 批量删除 + 导入/导出按钮槽。全部库 Tab 复用，不许各 Tab 各写一套。 |
| `src/components/ImportDiffPreview.jsx` | 新 | 导入差异预览（§8.3）：新增 / 更新（字段级 diff）/ 跳过 / 错误四组 + 逐行勾选 + 确认导入。 |
| `src/components/ConfirmDialog.jsx` | 新 | 确认框组件：标题 + 影响说明（数量 + 示例名称）+ 确认/取消；删除类操作必须用它，不许直接用 `window.confirm`（`window.confirm` 无法展示影响明细）。 |
| `src/components/Toast.jsx` | 新 | 轻提示（保存成功 / 已撤销 / 导入完成），替代散落在各页的 `alert`（`alert` 阻断操作，仅保留给真正的阻塞错误）。 |
| `src/styles.css` | 改 | 新增工作台三区布局、分页条、模态框、差异预览表、警告条、错误态样式；不改现有视觉风格（字体/配色沿用）。 |
| `electron/main.cjs` | 改 | db v2 加载 + 迁移（§4）；原子保存 + 备份策略（B3，§4.3）；新增 IPC（见 §3.3）；`db:save` 改为补丁/节流保存入口（见 §3.3）。 |
| `electron/excel.cjs` | 改 | 保留导入函数（`importQuantities` / `importQuotas`，新增通用 `importLibrary(filePath, kind)`）；`exportQuotas` 泛化为 `exportLibrary(filePath, kind, rows)`；**删除**旧简易版式 `exportProject`，改为调用 `printExport.exportBudgetBook`（避免两套导出并存漂移）。 |
| `electron/printExport.cjs` | 新 | 打印导出实现（§5）：`exportBudgetBook(filePath, project, result, profile, opts)`，ExcelJS 实现 11 张表。 |
| `electron/configIO.cjs` | 新 | 配置文件 IO：`exportProfileToFile(filePath, profile)`、`importProfileFromFile(filePath)`、`exportConfigBackup(filePath, db)`——全部经主进程 `fs` 写真实路径（B1），不许走浏览器下载。 |
| `electron/preload.cjs` | 改 | 暴露新增 IPC（见 §3.3）；删除或保留 `exportQuotas`/`exportProject` 按 §3.3 映射表。 |
| `tests/engine.test.mjs` | 改 | 沿用现有断言（v1 口径回归），新增 §12.1 的引擎断言。 |
| `tests/crosscheck.test.mjs` | 改 | LO 交叉验证：夹具重建（见 §12.2），断言表扩展到折前/折后双版本 + 安全生产费 + 汇总表新口径。 |
| `tests/excel.test.mjs` | 改 | 导出断言改为打印导出（11 张表 + 版式），导入断言沿用。 |
| `tests/profiles.test.mjs` | 新 | 多配置隔离 + 方案导出/导入往返 + 方案复制。 |
| `tests/discount.test.mjs` | 新 | 打折模型（参考样本逐项，见 §12.1）。 |
| `tests/migration.test.mjs` | 新 | v1→v2 迁移（见 §12.1）。 |
| `tests/print.test.mjs` | 新 | 打印导出结构断言（见 §12.1）。 |
| `tests/batch.test.mjs` | 新 | 批量操作（导入差异分类、批量删除、批量改价/改折扣）。 |
| `tests/validate.test.mjs` | 新 | B7 校验（孤儿行、编号重复、数量异常）。 |
| `tests/fixtures/reference-project.json` | 新 | 参考结算书样本工程夹具（表三甲 41 行 + 表三乙 5 行 + 表三丙 8 行 + 表四甲 16 行，逐字转录自 raw.json，见 §12.4）。 |

### 3.1.1 计算引擎接口（`src/engine/calc.mjs`）

```js
// libs：解析后的方案库（由 store.js profileToLibs(profile) 产出，不再是 db.libraries）
export function calcProject(project, libs)
// libs = {
//   quotas, materials, rules, shortlist,
//   rates,            // 具名费率（§2.2.1 rates）
//   winterTable,      // 从 rates.winterTable 透传（兼容旧调用可单独传）
//   machinePrices, instrumentPrices, quotaMachines, quotaInstruments,
//   discountRule,     // 打折规则（§2.2.1）
//   table5Fees,       // 表五费用项配置（§7.3）
//   dispatch,         // 调遣参数（§2.2.1 dispatch）
// }

// 返回值（新增字段标注 ★）：
{
  info, rate,                      // rate：解析后的具名费率快照（供界面展示“本次计算用的费率”）
  techSub, laborSub, adjRate, techDays, laborDays,
  table3A, table3B, table3C,
  table4A, table4B, table4Equip,
  table2Before: {...},            // ★ 折前表二（全部费用项，不打折）
  table2After: {...},             // ★ 折后表二（按 discountRule 逐项打折）
  table2: {...},                   // 兼容字段 = table2After（旧调用方不改代码仍能读到折后值）
  table5: { rows: [...], totalExcl, totalVat, totalIncl }, // ★ rows 为明细行数组（每项 key/name/basis/amount…）
  table1: {...},                   // afterDiscount 取 table2After.exclTax（见 §7.2）
  summary: {...},                   // 新口径（见 §7.2）
  warnings: [],                    // ★ [{code, message, rowIds?}]，如 orphanQty、missingRate、duplicateCode
  surveyKm, surveyRaw,
}
```

- `calcProject` 内部不再含打折快捷公式：先算 `table2Before`（等价于 v1 在 `discount=1` 时的表二），再调 `applyDiscount(table2Before, discountRule)` 得 `table2After`。表一/表五/汇总表全部以 `table2Before` / `table2After` 为输入，不许各自再算一遍折扣。
- `RATE_ITEMS`（v1 的 HLOOKUP n 映射表）**删除**，由 `rates.mjs` 的 `RATE_FIELD_DEFS` 替代；`rateFor(rateGrid, ...)` 删除，旧测试中如有直接调用需同步改掉（现测试均走 `calcProject`，无直接调用）。
- `DISPATCH_PRICE` / `DISPATCH_PEOPLE_*` 硬编码常量**移出** `calc.mjs`，改为从 `libs.dispatch` 读；`libs.dispatch` 缺失时用内置默认表 + `warnings` 记一条（保证旧测试不传 dispatch 也能跑）。

### 3.2 打印导出模块（`electron/printExport.cjs`）

```js
// exportBudgetBook(filePath, project, result, profile, opts)
//   project：工程记录（含 info、quantities、profileId）
//   result：calcProject 的返回值
//   profile：工程所属配置方案（用于取表五配置、打折规则、费率展示）
//   opts：{ includeSheets?: string[] }（默认 11 张全出；批量导出时仍全出，不许缺表）
// 返回：Promise<true>；失败时抛 Error（调用方展示错误，不许静默返回 true）
async function exportBudgetBook(filePath, project, result, profile, opts)
```

内部拆分（同一文件内函数，不另建文件）：

- `buildCover(wb, project, result, profile)` / `buildNotes(...)` / `buildSummary(...)` / `buildTable1(...)` / `buildTable2(...)`（折后 + 折前两张）/ `buildTable3A(...)`（分页）/ `buildTable3B(...)` / `buildTable3C(...)` / `buildTable4A(...)`（甲供/乙供/设备三组）/ `buildTable5(...)`
- `applySheetStyle(ws, layout)`：列宽 / 行高 / 页边距 / 页面设置 / 边框 / 字体（见 §5.4）
- `writeFixedFooter(ws, layout, project)`：表尾四段式（施工负责人 / 审核 / 编制 / 编制日期）
- `paginateTable3A(rows, layout)`：表三甲分页算法（见 §5.3）

### 3.3 主进程 IPC（`electron/main.cjs` + `electron/preload.cjs`）

| IPC 通道 | 入参 | 出参 | 说明 |
|---|---|---|---|
| `db:get` | — | `db`（v2） | 沿用 v1；加载时自动迁移（§4）；失败时返回 `{error}` 而不是抛未捕获异常（B9） |
| `db:save` | `db` 全量 | `true` | 沿用 v1（兼容旧调用）；主进程侧走原子写 + 备份节流（§4.3）；渲染进程新代码优先用 `db:savePatch` |
| `db:savePatch` | `{profileId?, projectId?, patch, baseVersion}` | `{ok, version}` | ★ 增量保存：只保存指定范围的补丁；`baseVersion` 不匹配时返回冲突，渲染进程重拉后重试（防覆盖丢失） |
| `db:exportProfile` | `{profileId, filePath}` | `{ok, filePath}` | ★ 经主进程 `fs` 写真实路径（B1） |
| `db:importProfile` | `{filePath}` | `{profile}` | ★ 经主进程读文件 + `importProfile` 校验 |
| `db:exportBackup` | `{filePath}` | `{ok}` | ★ 整库备份 JSON 写真实路径 |
| `dialog:openFile` / `dialog:saveFile` / `dialog:openDir` | 沿用 v1 | 沿用 v1 | 全部导出/导入的路径选择都走这里，不许用浏览器下载 |
| `excel:importQuantities` / `excel:importQuotas` | 沿用 v1 | 沿用 v1 | 导入解析（只解析、不落库；落库前必须过差异预览 §8.3） |
| `excel:importLibrary` | `{filePath, kind}` | `{rows, errors}` | ★ 通用库导入解析（kind 枚举见 §8.2），返回解析行 + 解析错误 |
| `excel:exportLibrary` | `{filePath, kind, rows}` | `true` | ★ 通用库导出（B1 真实路径） |
| `excel:exportBudgetBook` | `{filePath, project, result, profileId}` | `true` | ★ 打印导出（§5）；主进程内根据 `profileId` 取方案，渲染进程不许自己拼 `result` 再传旧格式 |
| `app:getVersion` | — | `{version, dbVersion}` | ★ 供“关于”与报错信息展示，报障先问版本号 |

`preload.cjs` 的 `window.api` 与上表一一对应；`Settings.jsx` 中现有的 `const { ipcRenderer } = { ipcRenderer: null }` 死代码**删除**（B1 遗留）。

### 3.4 打包清单口径（`build.files` 闭包 + asar）

- `package.json` 的 `build.files` 是 electron-builder 打包闭包的**唯一来源**：不在 glob 内的文件不会进包，无论源码树里是否存在。
- 主进程（`electron/*.cjs`）依赖的文件必须全部被闭包覆盖：
  - CJS `require()` 的同目录文件由 `electron/**` 覆盖；
  - 动态 `import()` 的 ESM 文件（如 `src/lib/profiles.js` 及其传递 import 的 `src/engine/*.mjs`）**不在默认闭包内**，必须显式列入 `files`（只列用到的文件，不许 `src/**` 整目录打进包）。
- **规则**：新增主进程动态 import 时，必须同步更新 `build.files` + `tests/packaging.test.mjs`；测试扫描 `electron/*.cjs` 的动态 import 目标，逐个断言被 glob 覆盖，未覆盖则 `npm test` 失败，CI 直接拦截。
- **asar 决定：`"asar": false`**。主进程动态 `import()` 走 Node ESM loader，不经过 Electron 的 asar 补丁路径，asar 内 ESM import 行为不确定；关闭 asar 后打包布局与 dev 完全一致（`Resources/app/` 即源码布局），出问题可直接在包内查文件。代价：包内文件明文可见（本应用无秘密代码/凭证，接受）；包体积略增（接受）。
- CI 联动：macOS `Verify package` 不许断言 `app.asar` 存在（asar 已关）；改为断言 `Resources/app/src/lib/profiles.js` + `dist/index.html` + `node_modules/exceljs/dist/exceljs.js` 存在 + `codesign --verify` 通过。
- v2.0.0 事故（见增量 8）：`files` 漏 `src/`，`main.cjs:8` 动态 import 打包后不存在 → `loadDb()` 抛错 → `whenReady` 回调拒绝 → `createWindow()` 从未执行 → 有菜单栏、无窗口、Dock 点击无反应。测试全过因测试跑在源码树；CI Verify 只查文件存在/大小，从不启动应用。

---

## 4. 迁移方案（v1 → v2）

### 4.1 触发时机与失败策略

- 触发：`loadDb()`（`electron/main.cjs`）读到 `db.version === 1`（或缺失 `version` 但含 `libraries`，视为 v1）时自动迁移；`version === 2` 直接加载；`version > 2` 拒绝加载，返回错误“数据版本高于本软件版本，请升级软件”，不许降级打开。
- 迁移是**同步阻塞**过程（在窗口创建前完成），任一步骤抛异常即中止：内存中保留 v1 数据、**不写回文件**、界面展示迁移失败错误 + “重试” + “导出 v1 数据备份”两个按钮（B9 错误态同样适用）。
- 迁移完成后先做一次自检（§4.4），自检失败同样视为迁移失败，按失败策略处理。

### 4.2 迁移步骤（按序执行，缺一不可）

1. **备份 v1**：把磁盘上的 `budget-data.json` 原文件完整复制为 `budget-data.v1-backup-<ISO时间戳>.json`（与现有 `budget-data.backup-*.json` 区分：后者是滚动备份，前者是迁移前一次性快照，**永不自动删除**）。同时在内存中保留 `v1Backup = { migratedAt, v1Db }`（深拷贝），随 v2 db 一起保存。
2. **生成默认配置方案**：调用 `seedToProfile()` 的逆向等价函数 `v1LibrariesToProfile(libraries, settings)`：
   - `id = 'prof_default'`（固定，便于追溯），`name = '默认配置'`，`source = 'migrated-v1'`。
   - `libraries.quotas`：逐行补 `id = uid()`（v1 无 id）；`shortlist` 同样补 id；`materials` 保留 v1 `id`（已有 `jia{i}/yi{i}/eq{i}`）；`rules` 保留 v1 `id`（已有 `rule{i}`）；`machinePrices` / `instrumentPrices` / `quotaMachines` / `quotaInstruments` 补 id（`id = <kind>_<序号>`）。
   - `rates`：调用 `rateGridToRates(rateGrid)`（§3.1 `rates.mjs`）：按 `RATE_ITEMS` 的 `n`（HLOOKUP 行号）与列 `G..K`（5 类工程）逐项转换；`rateGrid` 中为 `null` 的单元格（如冬雨季、施工用水电蒸汽费）按 §2.2.1 约定转 `winterRate: null` / `utilityRate: 0`；`rateGrid` 中 `增值税率` 行全 null → 不生成费率，改由 `vatRates` 承载。
   - `rates.vatRates`：`jiaTax = settings.defaultInfo.甲供增值税 ?? 0.13`；`yiTax = settings.defaultInfo.乙供增值税 ?? 0.09`；`outputTax = yiTax`；`safetyVat = 0`（§7 已定，不读旧值）。
   - `discountRule`：`discountRate = settings.defaultInfo.施工折扣 ?? 1`（注意：这是**方案级默认**；各工程的 `info.施工折扣` 仍保留，优先级见 §2.4）；`noDiscountKeys = DEFAULT_NO_DISCOUNT_KEYS`、`zeroAfterDiscountKeys = DEFAULT_ZERO_AFTER_DISCOUNT_KEYS`（§6.2，Q2 裁决 b）。
   - `table5Fees`：按 §7.3 默认 14 项生成；其中安全生产费 `rate: 0.02`（v1 是 0.015，**迁移时直接改为新口径**，见 §4.4 自检说明）。
   - `dispatch`：从 v1 `calc.mjs` 的 `DISPATCH_*` 常量原样搬运（值不变）。
3. **工程记录迁移**：每个 `project` 追加 `profileId = 'prof_default'`；`quantities` 每行补 `id = uid()`；补 `rateOverrides: {}`（如 v1 已有零散 `rateOverrides`，原样保留并把 `taxRate` 同步为 `yiTax`/`outputTax`）；补 `table5Overrides: []`、`warningsDismissed: []`。
4. **settings 迁移**：`settings.activeProfileId = 'prof_default'`；`settings.defaultInfo` 原样保留。
5. **组装 v2 db**：`{version: 2, configurationProfiles: [默认配置], projects, settings, v1Backup}`；**删除顶层 `libraries`**（数据已进方案，不许两处并存）。
6. **原子写回**：按 §4.3 原子写（写临时文件 → `fsync` → `rename` 覆盖），写回失败则按 §4.1 失败策略处理。

### 4.3 保存与备份（B3 联动）

- **原子写**：`saveDb()` 改为写 `budget-data.json.tmp-<pid>` → `fsync` → `rename` 覆盖 `budget-data.json`。`rename` 是原子操作，避免写一半崩溃导致 JSON 损坏（v1 是直接 `writeFileSync` 覆盖，无原子性）。
- **滚动备份节流**：v1 是每次保存都复制一份备份（每次按键都触发，见 §10 B3）。v2 改为：仅当距上次备份 ≥ 1 小时、或本次是迁移/导入/批量删除等重大操作时，才复制滚动备份（仍保留最近 5 份，`budget-data.backup-*.json`）；普通按键保存不复制。
- **回滚**：回滚 = 用 `budget-data.v1-backup-<时间戳>.json` 覆盖 `budget-data.json` 后重启（或在设置页提供“从 v1 备份恢复”按钮：列出 `v1-backup` 文件，选中后经主进程复制 + 重启）。回滚后 v2 期间的新数据丢失——恢复前必须弹窗确认并再次备份当前 v2 文件为 `budget-data.v2-before-rollback-<时间戳>.json`。

### 4.4 迁移自检（迁移完成后、写回前执行）

- 结构自检：`configurationProfiles.length === 1`；方案内 10 张库表行数与 v1 `libraries` 对应表行数逐项相等（quotas / shortlist / materials / rules / machinePrices / instrumentPrices / quotaMachines / quotaInstruments；`rateGrid` 转换为具名费率后逐项抽查：线路工程 `techPrice === 114`、`laborPrice === 61`、`auxRate === 0.003`）；每个工程 `profileId` 非空；全部行 `id` 无重复、无空。
- 计算自检：取第一个工程（若无工程则跳过），用 v1 引擎逻辑与 v2 引擎逻辑各算一次，对比 `table3A` 工日、`table2Before.exclTax`（v1 在 `discount=1` 时的 `exclTax`）、`table4A.totalExcl` 必须相等（容差 0.011）。**预期差异（不是 bug）**：`table5.safetyFee` 会变化（1.5%→2%）、`table1.afterDiscount` 会变化（快捷公式→逐项打折，见 §6.3），自检对比时排除这两项，并在迁移完成提示中告知用户“安全生产费口径已按现行规定更新为 2%，折后计算改为逐项打折，两处数值与 v1 不同属预期”。
- 自检任一项失败 → 按 §4.1 失败策略处理，不写回。

### 4.5 兼容处理

- **旧版 App 打开 v2 文件**：v1 代码 `loadDb()` 会把 v2 文件当成“缺 `libraries`”而用种子重建，导致数据丢失。缓解：v2 文件顶部不依赖 v1 识别；同时在发布说明中明确“v2 数据文件不可用 v1 打开”；`v1Backup` 是最后防线。
- **`seed.json`**：不改格式；`defaultDb()`（首次启动无数据文件时）改为：读 `seed.json` → `seedToProfile(seed, '默认配置')` → 生成 v2 db。`seedToProfile` 与 `v1LibrariesToProfile` 共用同一套转换逻辑（`rates.mjs` + `profiles.js`），不许写两份。
- **配置方案导出文件（JSON）**：格式版本号 `profileFormat: 1`，导入时校验该字段；未来格式升级时按 `profileFormat` 分发迁移函数。

---

## 5. 打印导出架构

### 5.1 目标：11 张表，按参考文件版式逐项还原

导出产物为**真实 `.xlsx`**（ExcelJS 生成），共 11 个工作表。工作表名与参考文件一致（参考文件表名本身不含“结算”字样，可直接沿用）；**各表内标题单元格改用“预算”口径**（参考文件是结算书，标题含“结算”；v2 输出预算书，不得照抄“结算”字样）。

| # | 工作表名 | 内标题（预算口径） | 来源 |
|---|---|---|---|
| 1 | 报表封面 | 通信建设工程预算书 | 参考封面，标题 36pt |
| 2 | 编制说明 | 编制说明 | 参考编制说明 |
| 3 | 建设项目总算表(汇总表) | 建设项目总预算表（汇总表） | 参考汇总表 |
| 4 | 工程总表(表一) | 工程预算总表(表一) | 参考表一 |
| 5 | 工程费用表(表二) | 建筑安装工程费用预算表（表二） | 参考表二（折后） |
| 6 | 工程费用表(表二)折前 | 建筑安装工程费用预算表（表二折前） | 参考表二折前 |
| 7 | 工程量表(表三)甲 | 建筑安装工程量预算表（表三）甲 | 参考表三甲 |
| 8 | 机械台班表(表三)乙 | 建筑安装工程机械使用费预算表（表三）乙 | 参考表三乙 |
| 9 | 仪器仪表使用表(表三)丙 | 建筑安装工程仪器仪表使用费预算表（表三）丙 | 参考表三丙 |
| 10 | 主要材料表(表四)甲 | 国内器材预算表（表四）甲 | 参考表四甲 |
| 11 | 工程其他费用表(表五)甲 | 工程建设其他费预算表（表五）甲 | 参考表五甲 |

> 未决：标题字样（“预算书 / 总预算表 / 费用预算表”）需对照 451 号文编制规程确认（见附录 B Q1）。在确认前按上表实现，确认后只改标题字符串，不动版式代码。

### 5.2 每表生成规则（按 `print-layout-spec.md` + raw.json）

通用规则（11 张表共用，源自 spec 全局规则）：

- 纸张 A4（`paperSize=9`）、横向、`fitToPage=false`、`scale=100`。
- **无**打印区域、无重复标题行、无 Excel 页眉/页脚对象（`oddHeader`/`oddFooter` 为空）；表头、表尾、页码全部是**单元格内文本**。
- 标题行 18pt 加粗居中（封面 36pt）；信息行 9pt（页码右对齐，其余左对齐）；表尾签名行 10pt 左对齐；正文中文 10pt；数值用宋体 10pt。
- 数据行高 16.55pt 为主，默认行高 15.2pt；各表标题/信息/表尾行高按 raw.json 逐表取（见 §5.4 表）。
- 边框：表头行上下 medium 粗线；数据行 thin 细线；每表最右侧列带右边框。合并区内的每个单元格都要写边框（ExcelJS 合并后只显示左上角单元格边框，需遍历合并区逐格设置）。
- 页码：单元格内文字 `第X页 共Y页`（不是 `&P`/`&N`），位于信息行最右侧，右对齐；按实际分页逐页生成。
- **固定版式**：数据区与表尾之间用空白行把表尾顶到固定行；表尾行号见 §5.4 表。数据溢出固定行时按 §5.3 分页，不许把表尾往下顶（顶表尾 = 破坏固定版式）。
- **数值单元格必须是数值型**（`number`），不许写文本型数字。参考文件转换后数值为文本型（`numFmt=@`）是转换产物，v2 不得照抄；金额 `numFmt='#,##0.00'`，工日 `numFmt='0.00'`，数量按单位取 2 位或原值。

各表结构（数据来源 + 版式要点；完整列宽/行高/合并区以 raw.json 为准，代码从 `printLayout.mjs` 读常量）：

1. **报表封面**（A1:F16，16 个合并区）：A1:D2 合并标题；E2:F2 合并工程编号（取 `info.项目编号` 或 `info.表格编号`，为空则留空，不编造）；第 4–11 行 A 列标签 + B:E 合并值（建设单位 / 工程名称 / 工程造价 / 设计单位 / 施工单位 / 监理单位 / 编制单位 / 参审人员；工程造价 = `table1.grandIncl` + `元`，格式 `#,##0.00元`）；第 13 行编制人/审核人、第 14 行资格证号（无数据则留空）、A15:E15 合并编制日期（取 `info.编制日期`，为空则用导出当天日期并标注“导出日”）。封面不写表尾签名行。
2. **编制说明**（A1:A2，无合并区，列宽 A=126.57）：A1 标题 21pt 加粗居中 + 下边框 medium；A2 正文 12pt 自动换行顶端对齐，内容分“一、编制依据”（4 条，固定文本，取费依据随配置方案的 `rates`/`discountRule` 动态生成对应句，如“折扣率按 XX% 计取”）+“二、造价分析”（工程属通信线路工程 / 分项构成 / 距基地里程 / 工程总费用及分项构成，全部取 `result` 实际值，不许写死参考样本值）。
3. **汇总表**（A1:N25，14 个合并区）：第 2 行信息行（建设项目名称 / 建设单位名称 / 表格编号 `-总` / 页码）；第 3–4 行两行列头；第 5 行罗马序号行 Ⅰ–XIV；第 6 行数据（工程名称取 `info.单项工程名称`，表格编号 `-1`…按 `info.表格编号` 前缀 + 表后缀，见 spec“表格编号形如 `-总`/`-1`…”）；第 7 行工程总计；第 8–24 行空白填充；第 25 行表尾。数值口径见 §7.2（建安费列 = 折后建安费，其他费用列 = 表五总计）。
4. **表一**（A1:M27，15 个合并区）：结构同汇总表；第 7 行工程费（建安费列 = 折后建安费）、第 8 行工程建设其他费（其他费用列 = 表五总计）、第 9 行总计；第 10–26 行空白填充；第 27 行表尾。
5. **表二（折后）+ 表二折前**（各 A1:J24，29 个合并区）：**两张表版式完全一致**（列宽、行高、合并区、页边距相同），仅“依据和计算方法”列与数值不同。左右双栏：左栏建安工程费合计/直接费/直接工程费/人工费/材料费/机械/仪表/措施 1–6 项；右栏措施 7–15 项/间接费（规费 1–4 项 + 企业管理费）/利润/销项税额。折后表计算方法列体现打折关系（见 §6.4）；折前表计算方法列不带折扣。**两张表均无“安全生产费”行**（安全生产费在表五甲，见 §7.1）；若某工程配置的表二内含安全生产费行，同样按不打折项处理（§6.2），不单独写死。
6. **表三甲**（分页，见 §5.3）：列头两行（序号 / 定额编号 / 项目名称（C:D 合并）/ 单位 / 数量 / 单位定额值（技工/普工）/ 合计值（技工/普工））；数据行按工程量顺序（定额编号可重复，不合并；`variant` 为空时项目名称取定额库 `name`）；合计行 `定额工日合计`（技工/普工各一列，取 `techDays`/`laborDays`，含 ≤100×15%/≤250×10% 调整，调整行单独列示为“调整”行或在合计行备注中说明——与参考文件一致：参考第 52 行为合计行，调整已含在内；v2 在合计行下方以小字备注“其中调整 +X 工日”）。`工日X0.5` 类变体行：项目名称原样输出（含 `工日X0.5` 后缀），数量取加权量。
7. **表三乙**（A1:J28，17 个合并区）：列头（序号 / 定额编号 / 项目名称 / 单位 / 数量 / 机械名称 / 单位定额值（数量(台班)/单价(元)）/ 合计值（数量(台班)/合价(元)））；数据行取 `table3B.rows`；随后 1 行 `小计`（合价 = `table3B.total`）；空白填充至第 27 行；第 28 行表尾。
8. **表三丙**（A1:J27，17 个合并区）：与表三乙同构，取 `table3C.rows`；合计行文字为 `合计`（与参考一致，乙用“小计”、丙用“合计”，不许统一）。
9. **表四甲**（A1:J29，16 个合并区）：标题 + 副标题 `（主材）表`；两行列头（序号 / 名称 / 规格程式 / 单位 / 数量 / 单价(元)（除税价）/ 合计(元)（除税价/增值税/含税价）/ 备注）；分组：`『甲供材料』`分组头 + 甲供行 + `甲供材料小计`；`『乙供材料』`分组头 + 乙供行 + `乙供材料小计`；`『设备』`分组头 + 设备行 + `设备小计`；`总计`行（= 三组小计之和）。参考样本无乙供分组、总计 = 甲供小计；v2 有乙供/设备时按三组输出，无某组时该组分组头+小计**整组省略**（不输出空分组），总计行始终输出。备注列：取材料库 `remark`；未建档材料（`unmatched`）备注写 `未建档`。
10. **表五甲**（A1:H28，35 个合并区）：两行列头（序号 / 费用名称 / 计算依据及方法（C:D 合并）/ 金额（元)（除税价/增值税/含税价）/ 备注）；费用项目 14 项按 `table5Fees[].order` 排序（含 5.1 勘察费 / 5.2 设计费子项）；空值项目输出空单元格（不输出 0，与参考一致——参考仅安全生产费有值）；`总计`行；`生产准备及开办费(运营费)`行（总计之后，空值时为空）；空白填充；第 28 行表尾（编制与编制日期同单元格，格式 `编制：<编制人><空格分隔>编制日期：<日期>`，与参考一致）。

### 5.3 分页规则

- **表三甲**（唯一在参考中跨页的表）：每页固定 29 行（标题 1 + 信息 1 + 列头 2 + 罗马序号 1 + 数据区 + 空白填充 + 表尾 1）。第 1 页数据区容量 23 行；后续每页数据区容量 18 行（含末页合计行占 1 行）。算法：`pages = chunk(dataRows, [23, 18, 18, ...])`，其中末页若含合计行则该页数据行 ≤17 行；每页重复标题行 + 信息行 + 列头 + 罗马序号行（单元格内重复，非打印标题行）；每页信息行页码为 `第X页 共Y页`（Y = 总页数）；第 1 页后每页起始处加手动分页符（`ws.rowBreaks.append({id: 页首行号 - 1})`，参考唯一分页符在第 29 行之后）。
- **其他表**：单页固定行（见 §5.4）。若数据行超过固定行容量（例如表三乙数据行 > 固定容量、表四甲三组行数 > 固定容量），按同款“重复标题 + 信息行 + 列头 + 页码”规则分页，每页固定行高，表尾只在末页出现（中间页无表尾）。参考样本中这些表均未溢出，溢出阈值按各表“表尾行号 − 表头行数 − 1”计算，不另行约定。
- **页码**：导出时先算好总页数再写各页页码，不许先写 `共1页` 再改；表三甲总页数由分页算法得出，其他表总页数由溢出分页得出。

### 5.4 版式常量表（`printLayout.mjs` 的数据来源，数值取自 raw.json）

| 表 | 范围 | 表尾行 | 页边距（英寸，左/右/上/下/页眉/页脚） | 备注 |
|---|---|---|---|---|
| 报表封面 | A1:F16 | —（无表尾） | 0.80 / 1.39 / 0.98 / 0.98 / 0.51 / 0.51 | 列宽 A 21.37 B 36.61 C 18.09 D 18.63 E 16.44 F 1.23 |
| 编制说明 | A1:A2 | — | 0.80 / 0.68 / 0.98 / 0.98 / 0.51 / 0.51 | 列宽 A 126.57；A2 行高 380.90（随内容换行自动增高） |
| 汇总表 | A1:N25 | 25 | 0.61 / 0.22 / 0.79 / 0.79 / 0.51 / 0.51 | |
| 表一 | A1:M27 | 27 | 0.61 / 0.29 / 0.79 / 0.79 / 0.51 / 0.51 | |
| 表二（折后/折前） | A1:J24 | 24 | 0.44 / 0.22 / 0.62 / 0.31 / 0.51 / 0.51 | 折前表第 22 行行高 35.30（销项税额方法文字换行），折后表 20.15 |
| 表三甲 | A1:J58（2 页） | 29 / 58 | 0.61 / 0.53 / 0.79 / 0.71 / 0.51 / 0.51 | 每页 29 行；分页符在 29 行后 |
| 表三乙 | A1:J28 | 28 | 0.61 / 0.49 / 0.79 / 0.71 / 0.51 / 0.51 | |
| 表三丙 | A1:J27 | 27 | 0.61 / 0.44 / 0.79 / 0.71 / 0.51 / 0.51 | 第 6–7 行行高 23.75（名称换行） |
| 表四甲 | A1:J29 | 29 | 0.61 / 0.41 / 0.79 / 0.71 / 0.51 / 0.51 | 标题行高 29.50，副标题 12.25 |
| 表五甲 | A1:H28 | 28 | 0.61 / 0.41 / 0.79 / 0.71 / 0.51 / 0.51 | 表尾编制与日期同单元格 |

完整列宽/行高/合并区列表不全文抄入本文档，以 `docs/print-layout-spec.raw.json` 为准；`printLayout.mjs` 由 raw.json 生成（生成脚本 `scripts/genPrintLayout.mjs`，读取 raw.json 输出常量文件，人工核对一次后提交；后续版式调整只改生成脚本输入，不手写常量）。

### 5.5 ExcelJS 实现要点

- `const wb = new ExcelJS.Workbook(); wb.creator = '通信概预算';` 每表 `wb.addWorksheet(表名)`；工作表名含括号与中文，ExcelJS 直接支持。
- 列宽：`ws.columns = [{width}, ...]` 按 raw.json；行高：`ws.getRow(n).height = ...` 按 raw.json（未显式给出的行用默认 15.2pt）。
- 合并：`ws.mergeCells('A1:D2')`；合并区内除左上角外单元格不写值，但**逐格写边框与填充**（否则边框断裂）。
- 字体：`cell.font = {name: '宋体', size: 10, bold: false}`（中文正文/数值）；标题 `{name: '宋体', size: 18, bold: true}`（封面 `{size: 36}`）；编制说明标题 `{size: 21}`；封面值 `{name: '黑体', size: 18, bold: true}`。参考转换后部分字体显示 `Noto Sans CJK SC` 是 LibreOffice 替换，v2 统一用宋体/黑体（见附录 B Q6）。
- 对齐：标题 `center`；信息行 `left`（页码 `right`）；数值 `right`；表尾 `left`；垂直一律 `center`；编制说明正文 `wrapText: true, vertical: 'top'`。
- 边框：`cell.border = {top: {style: 'medium'}, bottom: ..., left: ..., right: ...}`；表头行上下 medium，数据行 thin，最右侧列右边框 thin。
- 页面：`ws.pageSetup = {orientation: 'landscape', paperSize: 9, fitToPage: false, scale: 100}`；`ws.pageMargins = {left, right, top, bottom, header, footer}`（英寸值，取 §5.4）；`ws.printArea = ''`、`ws.printTitles = ''`、`ws.headerFooter = {}`（显式清空，不用 Excel 页眉页脚功能）。
- 分页符：`ws.rowBreaks.append({id: 29})`（表三甲第 1 页后；`id` 为分页符上方最后一行行号，ExcelJS 语义）。
- 写入：`await wb.xlsx.writeFile(filePath)`（主进程，真实路径）；失败抛错，调用方按 B9 展示错误。
- 性能：表三甲大工程（>500 行）时逐格设置样式仍可接受（<2000 单元格操作）；若实测导出 >3 秒，后续增量再做样式缓存优化，不在本增量预优化。

---

## 6. 打折模型

### 6.1 现状与问题（v1 公式是错的，必须替换）

v1 `calc.mjs`：

```js
t1.afterDiscount = r2((t2.exclTax - t2.mainMat - t2.regFee) * discount + t2.mainMat + t2.regFee);
```

该公式把“除主材、规费外全部打折”作为整体乘数。参考样本实测反证：折扣率 37.9% 时，文明施工费折后仍为 2893.77（= 折前值，未打折），而 v1 公式会把文明施工费打折。按 v1 公式算参考样本：`(512509.64 − 74246.30 − 64994.13) × 0.379 + 74246.30 + 64994.13 = 280709.46`，与参考折后除税价 265267.65 相差 15441.81，**不可接受**。v2 删除该快捷公式，改为 §6.2 逐项打折。

### 6.2 逐项打折规则

- 输入：`table2Before`（全部费用项折前值，由引擎按 `discount=1` 算出）+ `discountRule = {discountRate, noDiscountKeys, zeroAfterDiscountKeys}`。
- 输出：`table2After`（全部费用项折后值）。规则：
  - 若折扣率 `< 1` 且 `key ∈ zeroAfterDiscountKeys`：`after[key] = 0`（Q2 裁决 b，见下）。
  - 若 `key ∈ noDiscountKeys`：`after[key] = before[key]`（保持折前值），且计算方法列按 §6.4 写“÷折扣率”表达式（即该项在折后表中的金额等价于“折后基数 × 费率 ÷ 折扣率”，与参考文件写法一致）。
  - 否则：`after[key] = r2(before[key] × discountRate)`。
  - 合计项（直接工程费 / 直接费 / 措施项目费 / 间接费 / 规费 / 建安工程费除税价 / 含税价）**不直接乘折扣率**，而是由折后明细项加总：`after[合计] = Σ after[明细]`。规费合计 = 规费子项（排污 + 社保 + 公积金 + 危伤）之和；建安工程费除税价 = 直接费 + 间接费 + 利润（折后明细加总）。这样合计项天然与明细一致，不产生“合计 ≠ 明细和”的舍入裂缝。
  - 销项税额：`after[outputTax] = r2((after[exclTax] − after[jiaMat]) × outputTaxRate + after[jiaMat] × jiaTax)`（与折前公式同构，基数取折后值；参考样本销项税额为空/0，v2 按公式算出值并展示，见附录 B Q5）。
  - 折扣率 `discountRate` 取值范围 (0, 1]；`=1` 时 `table2After ≡ table2Before`（零值清单不生效；仍输出两张表，数值相同，方法列折后表标注 `X100%` 或省略折扣后缀——统一标注 `X{rate}%`，`rate=100` 时即 `X100%`，不做特殊分支）。
  - 两清单同时含某项时折后=0 优先。
- 默认不打折清单 `DEFAULT_NO_DISCOUNT_KEYS`（以参考文件实测为准）：

```js
['mainMat',    // 主要材料费：74246.30 → 74246.30（未打折）
 'auxMat',     // 辅助材料费：222.74 → 222.74（= 主材 × 0.3%，主材不打折则辅材不打折）
 'civilFee',   // 文明施工费：2893.77 → 2893.77（折后表方法列：人工费X1.5%/37.9%）
 'regFee',     // 规费合计：64994.13 → 64994.14（折后表方法列：(1-4之和)/37.9%，0.01 为舍入差，见 §6.5）
 'socialFee', 'housingFee', 'accidentFee', // 规费子项：随规费不打折
 'sewageFee',  // 工程排污费：规费子项，随规费不打折（样本为空，仍列入）
 'safetyFee',  // 安全生产费：不在表二内，但若某配置表二内含该行，同样不打折（见 §5.2）
]
```

- 默认折后=0 清单 `DEFAULT_ZERO_AFTER_DISCOUNT_KEYS`（Q2 裁决 b，仅折扣率 < 1 时生效）：

```js
['carryFee',   // 工地器材搬运费：6559.22 → 0
 'disturbFee', // 工程干扰费：11576.00 → 0
 'tempFee',    // 临时设施费：9649.00 → 0
 'nightFee',   // 夜间施工增加费：4823.00 → 0
 'winterFee',  // 冬雨季施工增加费：3472.53 → 0
 'utilityFee', // 施工用水电蒸汽费：964.59 → 0
 'specialFee', // 特殊地区施工增加费：0 → 0（样本为空）
 'protectFee', // 已完工程及设备保护费：3858.00 → 0
 'earthFee',   // 运土费：0 → 0（样本为空）
 'dispatchFee',// 施工队伍调遣费：5917.36 → 0
 'bigMachineFee', // 大型施工机械调遣费：0 → 0（样本为空）
]
```

- 可定制：`noDiscountKeys` / `zeroAfterDiscountKeys` 在配置方案的打折规则页以复选框呈现（枚举来自 `DISCOUNT_LINE_DEFS`，不许手写；同一项不可同时勾选两列）；增删立即影响该方案下全部工程的折后计算；配置导出时随方案一起导出（JSON 内 `discountRule` 字段）。
- **已裁决（附录 B Q2，用户 2026-10-14 选 b）**：参考样本折后表中为空/0 的 11 项措施项（工地器材搬运费、工程干扰费、临时设施费、夜间施工增加费、冬雨季施工增加费、施工用水电蒸汽费、特殊地区施工增加费、已完工程及设备保护费、运土费、施工队伍调遣费、大型施工机械调遣费）**折后 = 0**。实现见下 `DEFAULT_ZERO_AFTER_DISCOUNT_KEYS`；完整参考折前表 + 默认规则 → 折后措施 10059.14、折后除税价 265267.64（参考 265267.65，差 0.01 为规费舍入，见 §6.5），此前 17377.17 差额已消除。折后表该 11 行整行空（含方法列，见 §6.4）。

### 6.3 表一/表五/汇总表与打折的关系

- 表一 `afterDiscount = table2After.exclTax`（不再用 v1 快捷公式）。
- 表一 `taxAfter`：按折后销项税额（§6.2）计；`taxBefore` 按折前销项税额。
- 表五安全生产费取费基数用**折前**建安工程费除税价（见 §7.1），不随打折下调；表五其余项（管理费/勘察设计费）取费基数同样用折前值（除非某项配置显式指定 `basis: 'afterDiscountExclTax'`，见 §7.3）。
- 汇总表建安费 = 表一折后建安费（见 §7.2），即打折后的值。

### 6.4 折后表“依据和计算方法”列

折后表每行方法列必须体现打折关系（参考文件写法）：

| 费用项 | 折前方法列 | 折后方法列 |
|---|---|---|
| 技工费 | `技工总工日X114` | `技工总工日X114X37.9%` |
| 普工费 | `普工总工日X61` | `普工总工日X61X37.9%` |
| 机械使用费 | `机械费合计` | `机械费合计X37.9%` |
| 仪表使用费 | `仪表费合计` | `仪表费合计X37.9%` |
| 文明施工费（不打折） | `人工费X1.5%` | `人工费X1.5%/37.9%` |
| 规费（不打折） | `1-4之和` | `(1-4之和)/37.9%` |
| 规费子项（不打折） | `人工费X28.5%` 等 | `人工费X28.5%`（子项方法列不带 ÷，与参考一致：参考折后表社保/公积金/危伤方法列与折前相同） |
| 企业管理费（打折） | `人工费X27.4%` | `人工费X27.4%`（参考折后表企管方法列与折前相同——注意：参考中打折项的方法列并非全部带 `X37.9%`，企管/利润/社保子项均未标注；v2 折后方法列按 `DISCOUNT_LINE_DEFS[].methodAfter` 逐项定义，不统一追加后缀） |
| 利润（打折） | `人工费X20%` | `人工费X20%`（同上） |
| 折后=0 的措施项（Q2 裁决 b） | 正常方法列 | （空——整行空，与参考折后表一致；折前表不受影响） |

实现：`DISCOUNT_LINE_DEFS` 每项含 `{key, label, methodBefore, methodAfter}`；`methodAfter` 支持模板占位符 `{techPrice}` / `{laborPrice}` / `{rate}` / `{discountPct}`，导出时按当前配置渲染。**不许**用字符串拼接 `methodBefore + 'X37.9%'` 统一生成（与参考不符）。

### 6.5 舍入约定

- 每行折后值单独 `r2()`；合计行 = 折后明细行之和（不再 `r2` 一次总公式），保证“合计 = 明细和”在导出表上逐项成立。
- 参考样本规费：折前 64994.13，折后 64994.14，差 0.01。v2 按“折后规费子项各自 `r2(折前子项)`（不打折故等于折前子项）再求和”算，与折前规费合计可能差 ±0.01——这是**预期舍入差**，不是 bug。交叉验证时规费合计容差放宽到 0.02，其余项容差 0.011（见 §12）。

---

## 7. 关键口径（已定，不许改）

### 7.1 安全生产费：现行财资〔2022〕136 号，通信工程 2% + 增值税 0

```
安全生产费（除税价）= 折前建安工程费除税价 × safetyRate
  其中 safetyRate 默认 0.02（可配置，见 §2.2.1 table5Fees[].rate），
       折前建安工程费除税价 = table2Before.exclTax
安全生产费增值税 = 安全生产费 × safetyVat，safetyVat 默认 0（可配置）
安全生产费含税价 = 除税价 + 增值税（默认 = 除税价）
```

- 参考核对：`10250.19 = 512509.64 × 2%`（精确到分），见表五甲第 15 行（除税价 = 含税价 = 10250.19，备注栏亦为 10250.19）。
- v1 是 `safetyFee = exclTax × 0.015`、`safetyVat = safetyFee × taxRate`（1.5% + 9%），**已过时，v2 删除**。451 号文只说参照财企〔2012〕16 号、未给定费率；以现行财资〔2022〕136 号为准。
- 落地位置：表五甲“安全生产费”行；表五甲中该行“计算依据及方法”列写 `折前建安工程费除税价X2%`（不写参考文件中的 `10250.19` 数值——参考该列写数值是样本 peculiarity，v2 写方法表达式）。
- 取费基数必须用**折前**建安工程费：折后表里安全生产费保持折前值（打折不含安全生产费，见 §6.2 `noDiscountKeys` 含 `safetyFee`）。

### 7.2 汇总表口径：按结算书，汇总表建安费含主材 = 表一折后建安费

```
汇总表.建筑安装工程费（除税价）= 表一.建筑安装工程费（折后）= table2After.exclTax
汇总表.其他费用（除税价）        = 表五.总计（除税价）= table5.totalExcl
汇总表.总价值（除税价）          = 建安费 + 其他费用
汇总表.增值税列                   = 表一对应增值税（销项税额 + 表五增值税）
汇总表.含税价                     = 除税价 + 增值税
```

- 参考核对：汇总表第 6 行：建安费 265267.65（= 表一第 7 行工程费 265267.65 = 表二折后除税价 265267.65）、其他费用 10250.19（= 表五总计 10250.19）、总价值 275517.84（= 265267.65 + 10250.19）。
- v1 的汇总表公式（`construction = (exclTax − mainMat − regFee) × discount + regFee`，主材单列“自购物资”，其他费 `mgmt2 + designTotal × 0.4 + safetyFee`）**全部删除**。其中 `× 0.4` 无依据，不得保留。
- 表一结构（v2）：第 7 行工程费（建安费列 = 折后建安费）、第 8 行工程建设其他费（其他费用列 = 表五总计）、第 9 行总计（= 两行之和）。v1 表一中的“建筑安装工程费（折前）”行在打印导出中不单独成行（折前值见表二折前表）；界面费用表（工作台）仍可同时展示折前/折后供对照。

### 7.3 表五：费用项可配置

表五 14 项（顺序与参考表五甲一致，`order` 即参考行序）：

| order | key | name | 默认 basis | 默认 rate/规则 | 说明 |
|---|---|---|---|---|---|
| 1 | landFee | 建设用地及综合赔补费 | manual | 0 | 默认空值（参考为空） |
| 2 | mgmt2 | 项目建设管理费 | preDiscountExclTax | 0.02 | v1 公式保留为默认；增值税率 0.06（v1 值，保留） |
| 3 | feasibilityFee | 可行性研究费 | manual | 0 | 默认空值 |
| 4 | researchFee | 研究试验费 | manual | 0 | 默认空值 |
| 5 | designTotal | 勘察设计费 | —（= 5.1 + 5.2 之和，不独立取费） | — | 合计行 |
| 5.1 | surveyFee | 其中：勘察费 | surveyKm（分段函数，见下） | v1 分段公式保留 | 勘察长度 = 测量类定额原量 / 10（v1 `surveyKm = surveyRaw / 10`，`surveyCodes = TXL1-001/002/003`） |
| 5.2 | designFee | 其中：设计费 | preDiscountExclTax | 0.045 × 1.1 | v1 公式保留为默认（`exclTax × 0.045 × 1.1`） |
| 6 | envEvalFee | 环境影响评价费 | manual | 0 | 默认空值 |
| 7 | supervisionFee | 建设工程监理费 | manual | 0 | 默认空值 |
| 8 | safetyFee | 安全生产费 | preDiscountExclTax | 0.02，增值税 0 | §7.1 已定 |
| 9 | importTechFee | 引进技术及进口设备其他费 | manual | 0 | 默认空值 |
| 10 | insuranceFee | 工程保险费 | manual | 0 | 默认空值 |
| 11 | tenderFee | 工程招标代理费 | manual | 0 | 默认空值 |
| 12 | patentFee | 专利及专利技术使用费 | manual | 0 | 默认空值 |
| 13 | otherFee | 其他费用 | manual | 0 | 默认空值 |
| 14 | productionPrepFee | 生产准备及开办费(运营费) | manual | 0 | 总计**之后**单独行，不计入总计（与参考一致） |

- `basis` 枚举：`preDiscountExclTax`（折前建安除税价）/ `afterDiscountExclTax`（折后建安除税价）/ `laborTotal`（折前人工费）/ `fixed`（固定金额 `amount`）/ `manual`（每工程手工填，默认空）/ `surveyKm`（勘察分段函数）。
- 每项含 `vatRate`（默认：管理费/勘察设计费 0.06，安全生产费 0，其余 0）；`enabled` 为 false 时该行不输出（不占行号——表五甲行号按启用项重排，表尾仍顶到固定行）。
- **未决（附录 B Q4）**：除安全生产费外，其余项的默认公式（管理费 2%、设计费 4.5%×1.1、勘察分段）是否保留。v2 默认保留 v1 公式（保证 v1 工程升级后除安全生产费外数值不变），但全部做成可配置；用户确认后如需改默认值，只改配置，不改引擎。

---

## 8. 批量操作设计

### 8.1 适用范围

- **库批量操作**：每套配置方案内的 10 张库表（定额、短单、材料、定额—材料映射、定额—仪表映射、定额—机械映射、关联规则、表二费率、表五费用——即 §2.2.1 中 `libraries` 的 8 张 + `rates` + `table5Fees`；其中“定额—材料映射”即 `rules`，与“关联规则”为同一张表，本处按用户口径拆为“定额—材料映射（变体/变体*/通用）”与“关联规则（备选）”两个视图，底层同表，以 `kind` 过滤）。
  - 费率批量操作：按工程类型批量导入/导出/改值（见 §8.2）。
  - 表五费用批量操作：整表导入/导出（JSON/Excel），单项启用/禁用批量切换。
- **工程批量操作**（`Batch.jsx` + `Projects.jsx`）：批量新建 / 批量导入 / 批量导出（打印版式）/ 批量改价 / 批量改费率 / **批量删除工程**（v2 新增）。
- **配置方案批量操作**：方案导出/导入（整方案 JSON，见 §2.2），不在库批量操作内。

### 8.2 每个库的通用操作（`LibraryTable.jsx` 统一实现）

工具栏（每库一致）：`[搜索框] [导入] [导出] [批量删除] [新增] [分页条：共 N 条，显示 M–K 条，每页 50/100/200]`

- **复选框 + 全选**：每行行首复选框；表头全选复选框三态（未选 / 部分选 / 全选）。“全选”分两档：`全选本页` / `全选全部（N 条）`，下拉选择；默认全选本页，避免用户误以为只选了本页却删了全部（或反之）。
- **批量删除**：点“批量删除”→ `ConfirmDialog`（见 §8.4）→ 确认后执行删除 → 撤销栈压入快照（B2）→ Toast 提示“已删除 N 条，可撤销”。删除后若该库被工程引用（如删除定额后某工程工程量含该编号），不级联删工程量行，而是产生 B7 孤儿警告（见 §10 B7）。
- **新增/编辑**：行内编辑（沿用 v1 单元格输入）；新增行默认插到顶部并聚焦第一个单元格；`id` 由系统生成，不许用户手填。
- **导出**：点“导出”→ `dialog:saveFile` 选真实路径 → 主进程写文件（B1）。格式：Excel（列头与导入格式一致，见 §8.3）或 JSON（二选一，下拉选择）。导出内容 = 当前筛选结果还是全部？默认**全部**，筛选时弹窗确认“导出全部 N 条还是仅筛选出的 M 条”。
- **导入**：点“导入”→ `dialog:openFile` → 主进程解析 → **差异预览**（§8.3）→ 确认后落库。解析错误（文件打不开、表头不对）在预览前展示，不进预览。

### 8.3 导入差异预览 / 校验（禁止静默覆盖）

导入流程（以定额库为例，其他库同构）：

1. 解析：`excel:importLibrary({filePath, kind})` 返回 `{rows, errors}`。`errors` 为解析级错误（如表头缺失必填列、某行编号为空、数值列非数字），预览前以错误列表展示；`errors` 非空时仍可预览有效行，但“确认导入”按钮置灰，直到用户勾选“我已知晓并跳过错误行”或修正文件重传。
2. 分类：对每行解析行，按该库的**业务主键**匹配现有库，分为四组：
   - **新增**（主键不存在）：绿色标记。
   - **更新**（主键存在且至少一个字段不同）：黄色标记，展开显示字段级 diff（`技工：1.20 → 1.50`），逐字段可勾选“采用新值 / 保留旧值”（默认全部采用新值）。
   - **跳过**（主键存在且全部字段相同）：灰色标记，默认不导入。
   - **错误**（主键重复出现在文件内、必填字段为空、枚举非法）：红色标记，不可导入。
   - 各库业务主键：定额 `code`；短单 `code + name`；材料 `name + spec`；规则 `quota + material + spec + kind + variant`；机械单价 `code`；仪表单价 `code`；定额—机械/仪表映射 `quota + mcode`；费率按 `工程类型 + 费率项目`；表五费用 `key`。
3. 选择：每组可整组勾选/取消；更新组可逐行勾选；顶部模式选择：`合并（默认）` / `全部替换`。选“全部替换”时必须在输入框中输入当前方案名确认（防误触），且替换前自动做一次方案级备份（见 §4.3 滚动备份）。
4. 确认：点“确认导入”→ 二次确认框显示“新增 N 条、更新 M 条、跳过 S 条、错误 E 条（已排除）”→ 执行 → Toast 提示结果 + 撤销栈压入快照。
5. **禁止静默覆盖**：任何导入不得在无预览、无确认的情况下覆盖现有数据。v1 的定额导入（`confirm('点确定=合并…')`）不符合本条，v2 删除该实现。

### 8.4 删除确认（与 B2 共用）

`ConfirmDialog.jsx` 规范：标题（如“删除 12 条定额？”）+ 影响说明（“其中 3 条被 2 个工程引用，删除后这些工程的工程量行将显示孤儿警告”——引用数由 `validateQuantities` 实时算出）+ 受影响名称示例（前 5 条）+ 确认按钮文案“确认删除”（红色）/ 取消。删除执行后 Toast 带“撤销”按钮（5 秒内有效，点后恢复）。

---

## 9. 单工程工作台布局（`Workbench.jsx`，替代 `ProjectDetail.jsx`）

目标：**工程信息、工程量录入、计算结果、打印导出集中在一个页面，一处录入、各表实时联动，不再多页跳转**。v1 的 5 个 Tab（工程量 / 费用表 / 材料表 / 表三 / 工程信息）互相跳转、改了工程信息要切 Tab 才看到结果，是本次要消除的流程反人类。

### 9.1 布局（三区 + 顶栏，不分页签）

```
┌────────────────────────────────────────────────────────────────────┐
│ 顶栏：← 返回 | 工程名 | 配置方案下拉 | 总计（含税）¥ | [导出预算书]   │
├──────────────┬──────────────────────────────┬────────────────────┤
│ 左区：工程信息 │ 中区：工程量录入             │ 右区：计算结果      │
│ （可折叠）    │ 定额搜索框 + 搜索结果          │ 表二（折前/折后切换）│
│ 全部 INFO_FIELDS│ 工程量表（行内编辑）         │ 表一 / 表五 / 汇总   │
│ + 施工折扣    │ 孤儿警告条（B7）              │ 表三甲/乙/丙（折叠） │
│ + 增值税覆盖  │                              │ 材料表（折叠）      │
│ + 表五单项覆盖 │                              │                    │
└──────────────┴──────────────────────────────┴────────────────────┘
```

- **顶栏**：工程名（可点击改名）；配置方案下拉（切换时按 §2.3 提示确认）；总计（含税）实时显示（`table1.grandIncl`）；`[导出预算书]`（`dialog:saveFile` 选路径 → `excel:exportBudgetBook` → Toast 提示路径；导出前若有未保存的编辑，先 `flushSync` 再导出）。
- **左区（工程信息）**：全部 `INFO_FIELDS`（v1 的 24 项，见 `ProjectDetail.jsx`）+ 配置方案名（只读展示）+ 施工折扣（与 `info.施工折扣` 同步，见 §2.3）+ 增值税覆盖（甲供/乙供/销项三项，`null` = 用配置值，占位提示显示配置值）+ 表五单项覆盖（仅当某项 `basis === 'manual'` 时出现输入框）。左区可折叠（折叠后中区变宽）；左区任何修改立即触发中区/右区重算（`useMemo`，无手动“重新计算”按钮）。
- **中区（工程量录入）**：定额搜索框（沿用 v1 逻辑：先搜短单、再搜全库，全库结果上限 50 条并提示“仅显示前 50 条，请细化关键词”）；搜索结果“添加”按钮；工程量表列：`[# | 定额编号 | 项目名称 | 单位 | 数量 | 工日系数 | 状态 | 删除]`；数量/系数行内编辑；`状态`列：正常为空，孤儿行显示 `⚠ 未建档`（B7），编号重复行显示 `⚠ 编号重复`；删除按行 `id`（B7）；底部显示“共 N 行，其中孤儿 M 行”。
- **右区（计算结果）**：表二默认显示**折后**，顶部切换 `[折后 | 折前]`（两版数值并排对照时用 `[对照]` 模式：折前/折后两列并排）；表一 / 表五 / 汇总为紧凑表；表三甲/乙/丙、材料表默认折叠（点击展开），展开后与 v1 同列展示；全部数值取 `calcFor(db, project)`，与左区/中区同一次计算结果，不许各自再算。
- **联动规则**：任何编辑（左区信息 / 中区数量 / 材料调整 / 单价覆盖）→ 本地状态更新 → `useMemo` 重算 → 三区同步刷新；保存走 `saveQueue` 节流（B3，见 §10）。不许出现“改了数量、结果没变”的状态不一致；如重算抛异常，右区显示错误态（B9），不许显示旧数值冒充新结果。

### 9.2 工作台与旧页面的关系

- `Projects.jsx`（工程列表）“打开”进入工作台；`Batch.jsx`“打开”同样进入工作台。
- v1 `ProjectDetail.jsx` 的 5 个 Tab 内容全部迁移到工作台三区，不丢功能：费用表 → 右区；材料表（含备选勾选）→ 右区折叠区；表三 → 右区折叠区；工程信息 → 左区；工程量 → 中区。
- 工作台不设路由参数，`App.jsx` 用 `openId` 控制（沿用 v1）。

---

## 10. v1 QA 问题修复设计（逐条给方案）

> 编号沿用 v1 QA 报告（B1–B9）。B5（安全生产费口径）、B6（汇总表口径）在 §7 已定为口径，本节不再重复，只写实现落点：B5 落点 `calc.mjs` 表五安全生产费公式 + `table5Fees` 配置；B6 落点 `calc.mjs` 汇总表公式 + 打印导出汇总表/表一数值映射。

### B1：配置导出必须真正写到用户选的路径，不许用浏览器下载冒充

- **病灶**：`Settings.jsx` `exportConfig()`：`saveFile` 只取了文件名，随后用 `Blob` + `<a download>` 走浏览器下载，文件落到浏览器下载文件夹，与用户选的路径无关；且有死代码 `const { ipcRenderer } = { ipcRenderer: null }`；提示文案“如需指定路径请在下载后移动”把 bug 说成 feature。
- **方案**：删除 Blob 下载实现。全部导出（配置方案 JSON / 整库备份 JSON / 各库 Excel / 预算书 xlsx）统一走：渲染进程 `window.api.saveFile()` 选真实路径 → IPC（`db:exportProfile` / `db:exportBackup` / `excel:exportLibrary` / `excel:exportBudgetBook`）→ 主进程 `fs.writeFile` / `wb.xlsx.writeFile` 写该路径 → 返回 `{ok, filePath}` → Toast 提示“已导出：<真实路径>”。主进程写失败时返回错误，渲染进程展示错误，不许提示“已导出”。
- **验收**：选桌面路径导出后，文件必须出现在该路径；下载文件夹中不许出现同名文件。

### B2：删除加确认框 + 全 App 至少一次撤销（或删除前备份）

- **病灶**：`Settings.jsx` 材料/定额/规则删除无任何确认（`L.materials = L.materials.filter(...)` 直接执行）；`Projects.jsx` 删除工程虽有 `confirm` 但无撤销、无备份；批量删除无确认。
- **方案**：
  - 全部删除操作走 `ConfirmDialog.jsx`（§8.4），含影响说明（引用数 + 名称示例）。
  - 撤销栈（`src/lib/undo.js`，`createUndoStack(limit=50)`）：删除前压入**受影响最小范围**的快照（删库行 → 该库表快照；删工程 → 该工程快照；批量删除 → 被删集合快照）。删除后 Toast 带“撤销”按钮（5 秒）；顶栏常驻“撤销”按钮（`canUndo()` 时可用，快捷键 `Cmd/Ctrl+Z`）。
  - 删除前备份：批量删除 / 全部替换导入 / 删配置方案时，除撤销快照外，另触发一次滚动备份（§4.3）。
  - 配置方案删除：若有工程引用该方案，禁止删除，提示“仍有 N 个工程使用该方案，请先将这些工程切换到其他方案”（并列出工程名 + 一键切换入口）。
- **验收**：任意删除后点“撤销”，数据原样恢复；删除配置方案时有工程引用则删不掉。

### B3：禁止每次按键全库深拷贝 + 全文件重写，改增量/节流保存

- **病灶**：`App.jsx` `updateDb()` 每次调用都 `JSON.parse(JSON.stringify(prev))`（整库深拷贝，库 2622 条定额 + 3218 条映射时每次按键都拷贝）+ `window.api.saveDb(next)`（整库写文件）；`main.cjs` `saveDb()` 每次保存还复制一份备份文件。输入一个字符 = 深拷贝 + 全文件写 + 备份复制。
- **方案**：
  - 渲染进程：`updateDb` 改为**补丁更新**——`setDb(prev => applyPatch(prev, patch))`（只替换被改的分支，如 `projects[i].quantities[j].qty`），不深拷贝整库；`calcFor` 的 `useMemo` 依赖改为被改分支的引用，库表未改时不重算。
  - 保存节流：`saveQueue.js`（`markDirty(patch)` 聚合 800ms 内的补丁 → 一次 `db:savePatch`；`flushSync()` 在导出/关闭/切换工程前强制同步）。连续输入时最多每 800ms 写一次盘；空闲时立即写。
  - 主进程：`db:savePatch` 只合并补丁后原子写（§4.3）；滚动备份节流（≥1 小时或重大操作才备份，见 §4.3）。
  - 关闭窗口前：`beforeunload` / `window-all-closed` 前调 `flushSync()`，未写完不许退出（失败时提示用户“有未保存的更改，仍要退出？”）。
- **验收**：在定额库单元格连续输入 20 个字符，磁盘写入次数 ≤ 3 次（用主进程日志计数验证）；关闭时无未保存丢失。

### B4：库表加分页或虚拟滚动，并明确提示总数与显示范围

- **病灶**：`Settings.jsx` 材料/定额表 `.slice(0, 200)` 截断且无任何提示（用户以为库只有 200 条）；`ProjectDetail.jsx` 定额搜索结果 `.slice(0, 50)` 同样无提示。
- **方案**：`LibraryTable.jsx` 统一分页：默认每页 50 条（可选 50/100/200）；分页条文案固定格式 `共 N 条，显示第 M–K 条`；搜索时文案为 `搜索“关键词”共 N 条，显示第 M–K 条`；`N` 为筛选后总数（不是当前页条数）。定额搜索结果上限 50 条时文案为 `全库匹配 N 条，仅显示前 50 条，请细化关键词`（N 由搜索函数返回总数，不许只返回截断后的数组）。
- **验收**：定额库 2622 条时分页条显示“共 2622 条”；搜索“TXL3”时显示匹配总数与“仅显示前 50 条”提示。

### B7：孤儿工程量行必须警告提示，编号重复时改/删必须定位到行，不许按编号首条匹配误伤

- **病灶**：`ProjectDetail.jsx` 工程量行按数组下标操作，定额编号与库无校验；`Settings.jsx` 定额编辑/删除按 `code` 查找（`L.quotas.find(y => y.code === x.code)` / `filter(y => y.code !== x.code)`），编号重复时改/删命中首条或误删多条；工程量行引用了库中不存在的编号时静默参与/不参与计算，无提示。
- **方案**：
  - 校验（`validate.mjs` `validateQuantities(project, profile)`）：对每行工程量，① `quota` 在方案定额库中不存在 → `orphanQty` 警告（行 id 列表）；② 同一 `quota` 在库中出现多次 → `duplicateCode` 警告（库中重复的 `code` + 行 id）；③ `qty <= 0` / `qty` 非数字 / `coef <= 0` → `invalidQty` 警告。返回 `warnings[]`，`calcProject` 透传到 `result.warnings`。
  - 展示：工作台中区顶部警告条（“有 M 行工程量引用了库中不存在的定额编号，将不参与计算”+ 展开列表 + “定位”按钮）；每行状态列标 `⚠ 未建档` / `⚠ 编号重复`；点击“定位”滚动到该行并高亮。
  - 定位：全部改/删按行 `id`（`quantities[].id`、`libraries.*[].id`），**禁止**按 `code` 做 `find`/`filter`。`Settings.jsx` 中所有 `find(y => y.code === x.code)` / `filter(y => y.code !== x.code)` 全部改为按 `id`；定额库出现重复 `code` 时，编辑页在该行旁显示“编号重复”标记，并提供“合并重复编号”工具（按 `id` 逐条确认去重，不自动合并）。
  - 孤儿行处理：孤儿行**不参与计算**（引擎跳过，`warnings` 记一条），但**保留在工程量表中**，不自动删除；用户可点“删除孤儿行”（批量，确认 + 撤销）或到库中补建该编号定额（补建后警告自动消失）。`warningsDismissed` 可逐条忽略警告（忽略后警告条不再出现，但行状态列仍标 `⚠`）。
  - 打印导出：孤儿行按 §11 规则处理（见 §11），导出前弹窗提示孤儿行数量并确认。
- **验收**：构造含孤儿行 + 重复编号的工程，警告条、行标记、定位、按 id 删除（只删目标行）四项均可复现验证。

### B8：费率读写用具名字段，不许 row/col 魔法下标，增值税率在全局费率页可见可改

- **病灶**：`calc.mjs` `rateFor(rateGrid, projectType, hlookupN)` 用 `rateGrid[3 + hlookupN - 2][6 + col]` 读写；`Settings.jsx` `setRate` 同样用 `L.rateGrid[3 + hlookupN - 2][6 + rateCol]`；`RATE_ITEMS` 的 `n` 是 HLOOKUP 行号，`6 + col` 是列偏移——改一个费率要同时理解两套魔法下标；增值税率被 `RATE_ITEMS.filter(it => it.key !== 'taxRate')` 排除，费率页看不见、改不了（只能到工程信息里改乙供增值税）。
- **方案**：`rates.mjs` 定义 `RATE_FIELD_DEFS`（具名字段 + 中文名 + 单位 + 说明，与 §2.2.1 `rates.byProjectType` 字段一一对应）；引擎与界面全部用 `rates.byProjectType[工程类型][fieldKey]` 读写；`rateGrid` 仅在迁移函数 `rateGridToRates` 中出现一次，迁移后代码库中不许再出现 `rateGrid[` 下标访问（用 `grep -r "rateGrid\["` 验证为 0）。
  - 费率页（`Settings.jsx` 费率 Tab）：按 `RATE_FIELD_DEFS` 逐项渲染（费率项目 / 数值 / 单位说明），工程类型下拉切换；新增“增值税率”分组：甲供增值税 / 乙供增值税 / 销项税额税率 / 安全生产费增值税率四项，可见可改（改后写入当前方案 `rates.vatRates`，影响该方案下全部工程；工程级覆盖仍在工作台左区改，见 §9.1）。
  - 冬雨季费率：费率页展示 winterTable 三类地区费率 + 每类工程的 `winterRate` 覆盖值（null = 查表，显示“按地区查表”）。
- **验收**：`grep` 验证无 `rateGrid[` 下标；费率页可见四项增值税率并可改，改后重算生效。

### B9：加载失败显示错误提示与重试，不许永远停在“正在加载数据…”

- **病灶**：`App.jsx` `useEffect(() => { window.api.getDb().then(setDb); }, [])` 无 `catch`；`main.cjs` `loadDb()` 失败时 `console.error` 后用种子重建（静默丢数据）；界面 `if (!db) return '正在加载数据…'` 无超时、无错误态。数据文件损坏 / 种子文件缺失 / IPC 失败时用户永远看到“正在加载数据…”。
- **方案**：
  - `App.jsx`：`getDb()` 加 `.catch` + 8 秒超时（`Promise.race`）；三种状态：`loading`（显示“正在加载数据…”+ 转圈）、`error`（显示错误信息 + “重试”按钮 + “从备份恢复”按钮 + “导出当前数据文件以便排查”按钮）、`ready`。`db:get` 返回 `{error}` 时同样进 `error` 态。
  - `main.cjs` `loadDb()`：读文件失败时**不静默用种子重建**；区分“文件不存在”（首次启动，正常用种子建库）与“文件存在但解析失败”（数据损坏，返回错误 + 保留损坏文件为 `budget-data.corrupt-<时间戳>.json`，再用最近滚动备份恢复并提示用户）。
  - 全部 IPC 调用（`saveDb` / 导出 / 导入）失败时渲染进程展示错误 Toast（含错误信息 + “重试”），不许静默失败或提示“已完成”。
  - 导出/导入/计算抛异常时，错误信息必须包含可定位内容（文件路径 / 工程名 / 表名），不许只显示“操作失败”。
- **验收**：把 `budget-data.json` 写成非法 JSON 后启动，界面显示错误态 + 重试/恢复按钮，不出现无限“正在加载数据…”。

---

## 11. 排除项：7 条无编号定额行先不进库，不编造编号

以下 7 条**不进定额库、不编造编号、不生成 `code`**（用户 2026-10-13 决定：先不进库，等定编号后再进）：

| # | 内容 | 来源 |
|---|---|---|
| 1 | 机架（箱）内安装光分路器（不取费）1:4 | 参考文件表三甲第 48–49 行（`不取费`，工日列为空） |
| 2 | 机架（箱）内安装光分路器（不取费）1:8 | 同上 |
| 3 | 预留 + 引上 6 芯 | v3.0 母版短单遗留（无编号行） |
| 4 | 预留 + 引上 12 芯 | 同上 |
| 5 | 预留 + 引上 24 芯 | 同上 |
| 6 | 预留 + 引上 48 芯 | 同上 |
| 7 | 预留 + 引上蝶形光缆 | 同上 |

- 引擎：这 7 条不在 `quotas` 中，工程量中若出现对应文字描述的行，按 B7 孤儿行处理（警告 + 不参与计算），**不许**为其自动匹配相近编号定额（如把“预留+引上 6 芯”匹配到某个 6 芯定额）。
- 导入：导入文件（含母版工程量表 / 简易表）中出现这 7 条文字时，导入差异预览将其归入“错误/跳过”组并注明“无编号定额行，暂不导入”，不许自动编造编号导入。
- 打印导出：工程量中若存在这 7 条的手工行（用户手动添加的孤儿行），导出时按参考文件格式原样呈现（定额编号列写 `不取费`、工日列为空），并在导出前弹窗提示孤儿行数量请用户确认；**不自动生成**这 7 条的表三甲行（即不主动把它们写进打印表，除非工程量中确实存在）。
- 验收：定额库中 `grep` 这 7 条关键词（分路器不取费 / 预留+引上）返回 0 条；导入含这 7 条的文件时预览中正确归类。

---

## 12. 测试与验收计划

### 12.1 新增测试覆盖（随各增量交付，`npm test` 统一跑）

| 测试文件 | 覆盖内容 | 关键断言（示例） |
|---|---|---|
| `tests/profiles.test.mjs` | 多配置隔离、方案导出/导入往返、方案复制 | 同一工程在“默认配置”与“复制方案（技工费 114→120）”下计算，`techFee` 不同；导出方案 JSON 再导入，`rates`/`discountRule`/`table5Fees` 逐项相等；复制方案后改复制方案的费率，原方案不受影响 |
| `tests/discount.test.mjs` | 表二双版本打折 | 参考样本：`discountRate=0.379` 时，`table2After.techFee=54836.58`、`laborFee=18279.41`、`machineFee=2114.82`、`instrumentFee=5857.54`、`civilFee=2893.77`（不打折）、`regFee=64994.14`（容差 0.02）、`exclTax=265267.65`；`discountRate=1` 时 `table2After ≡ table2Before`；11 项措施费折后=0（Q2 裁决 b）：完整参考折前表折后措施=10059.14、除税价≈265267.64（容差 0.02）；零值清单可定制（清空则 11 项恢复打折），折扣率=1 时零值不生效 |
| `tests/engine.test.mjs`（新增） | 安全生产费、汇总表口径 | `table5.safetyFee = table2Before.exclTax × 0.02`；`safetyVat = 0`；`summary.constructionExcl = table1.afterDiscount`；`summary.totalExcl = construction + other`；表五 14 项行数与 key 齐全 |
| `tests/migration.test.mjs` | v1→v2 迁移 | 用 v1 形状夹具（含 3 条定额、2 个工程、rateGrid 片段）迁移：方案数 1、名“默认配置”、行数逐项相等、工程 `profileId` 非空、库行 `id` 无重复；计算自检：`table3A` 工日与 v1 一致；`safetyFee` 按新口径变化（断言新值，不 assert 旧值） |
| `tests/batch.test.mjs` | 批量操作 | 导入差异分类：构造含新增/更新/跳过/错误的导入文件，分类计数正确；批量删除后撤销恢复；批量改价只影响选中工程；批量改折扣同步 `info.施工折扣` |
| `tests/validate.test.mjs` | B7 校验 | 孤儿行警告（含行 id）；编号重复警告；按 id 删除只删目标行；孤儿行不参与计算（`table3A` 无该行） |
| `tests/print.test.mjs` | 打印导出结构 | 11 张表名齐全；每表列宽/合并区数与 §5.4 一致；表尾在固定行；页码为单元格文本；数值单元格 `data_type === 'n'`；表二两张表版式一致；表四甲三组小计 + 总计；表三甲分页（41 行 → 2 页，第 2 页重复标题） |
| `tests/crosscheck.test.mjs`（改） | LO 交叉验证 | 夹具重建（见 §12.2）；断言扩展：折前/折后双版本表二、安全生产费、汇总表新口径；规费合计容差 0.02（§6.5），其余 0.011 |
| `tests/excel.test.mjs`（改） | 导入/导出 | 导出断言改为打印导出（见上）；导入断言沿用；新增通用 `importLibrary`/`exportLibrary` 往返断言 |
| `tests/packaging.test.mjs`（新，增量 8） | 打包闭包 | 扫描 `electron/*.cjs` 的动态 import 目标，逐个断言被 `build.files` glob 覆盖；断言 `asar === false`；`electron/main.cjs` 入口被覆盖 |
| `tests/hooks.test.mjs`（新，增量 8） | Hooks 顺序 | `src/App.jsx` 最后一个 Hook 调用在第一个 early return 之前（防“Rendered more hooks”整树卸载空白页） |

- 现有测试基数：引擎 12 + 交叉验证 29 + Excel 13 = 54。v2 目标：现有 54 项中除“旧口径”断言（安全生产费 1.5%、汇总表旧公式、表一快捷折扣、简易导出版式）外全部保留并通过；旧口径断言按新口径改写（改写清单在增量 2 变更记录中逐条列出，不许悄悄删除断言）。
- 测试不依赖 Electron（`printExport.cjs` 与 `calc.mjs` 均可在 Node 直跑）；`window.api` 相关逻辑只在渲染进程，测试覆盖到 `profiles.js` / `saveQueue.js` / `undo.js` 纯函数层。

### 12.2 导出用 LibreOffice 真实重算验证

- 流程：`printExport.exportBudgetBook()` 导出 `.xlsx` → `libreoffice --headless --convert-to xlsx`（或直接用 LO 打开重算）→ 用 `openpyxl` / ExcelJS 读回每个数值单元格 → 与引擎 `result` 逐项对比（容差 0.011，规费合计 0.02）。
- **注意**：v1 阶段“54 通过在本环境不可复现”（`crosscheck` 夹具 `/tmp/bt/lo_values.json` 不存在，CI 上跳过）。v2 必须**重建对照夹具**：把 §12.4 的参考样本工程夹具填入 v3.0 母版，用 LibreOffice 重算，产出 `tests/fixtures/lo_values.json` 并**进仓库**（不再放 `/tmp` 临时目录），`crosscheck.test.mjs` 不再因缺失夹具而跳过。
- 导出回读验证覆盖：11 张表全部数值单元格（不只表二/表一抽查）；文本型数字出现 1 个即失败（`data_type` 必须为 `n`）。

### 12.3 参考结算书逐项对数（版式 + 数值双重验收）

- 夹具：`tests/fixtures/reference-project.json`（转录参考文件表三甲 41 行 + 表三乙 5 行 + 表三丙 8 行 + 表四甲 16 行 + 工程信息；转录后用 raw.json 逐行复核，第二人复核一遍）。
- 对数表（工程信息取参考样本：建设单位“中国联合网络通信有限公司信阳市分公司”，工程名“2024年中国联通河南信阳宽带接入扩容工程（31）”，编制人 `adu`，编制日期 2026-05-13，折扣率 0.379，临时设施费按 35km 以上 5%）：

| 表 | 对数值（参考样本） | 容差 |
|---|---|---|
| 封面 | 工程造价 275517.84 元 | 0.011 |
| 汇总表 | 建安费 265267.65、其他费用 10250.19、总价值 275517.84 | 0.011 |
| 表一 | 工程费 265267.65、其他费 10250.19、总计 275517.84 | 0.011 |
| 表二折前 | 人工费 192918.18、技工 144687.55、普工 48230.63、主材 74246.30、辅材 222.74、机械 5580.00、仪表 15455.26、措施 67649.81、文明 2893.77、规费 64994.13、企管 52859.58、利润 38583.64、除税价 512509.64、销项税额 39443.70 | 0.011 |
| 表二折后 | 人工费 73115.99、技工 54836.58、普工 18279.41、主材 74246.30、辅材 222.74、机械 2114.82、仪表 5857.54、措施 10059.14、文明 2893.77、规费 64994.14、企管 20033.78、利润 14623.20、除税价 265267.65 | 规费 0.02，其余 0.011 |
| 表三甲 | 技工合计 1269.189 工日、普工合计 790.666 工日 | 0.011 |
| 表三乙 | 小计 5580.00（光纤熔接机，单价 144.00） | 0.011 |
| 表三丙 | 合计 15455.26 | 0.011 |
| 表四甲 | 甲供小计 = 总计 74246.30（除税价） | 0.011 |
| 表五甲 | 安全生产费 10250.19、总计 10250.19 | 0.011 |
| 版式 | 11 张表列宽/行高/合并区/页边距/表尾行号/页码与 §5.4 一致（逐项比对 raw.json） | 逐项相等 |

- **已知差异（不是 bug，验收时不计入失败）**：参考文件表二折后销项税额为空/0，v2 按公式算出值（见附录 B Q5）；参考表五甲安全生产费“计算依据及方法”列写数值 `10250.19`，v2 写方法表达式（见 §7.1）；参考文件数值为文本型，v2 为数值型（见 §5.2）。
- **Q2 已裁决（增量 7）**：完整参考折前表经默认规则计算后，折后措施 10059.14、折后除税价 265267.64（与参考 265267.65 差 0.01，为规费舍入，容差内），此前 17377.17 差额已消除。
- 对数方式：自动化（`tests/print.test.mjs` + `crosscheck`）+ 人工抽查（LibreOffice 打开导出文件，肉眼核对一遍版式：标题、表尾、页码、分组头）。

### 12.4 验收通过标准（v2 整体）

1. `npm test` 全量通过（含新增测试，旧口径断言已按新口径改写并列入变更记录）。
2. 打印导出 11 张表齐全，LibreOffice 回读数值与引擎一致，版式与 §5.4 一致。
3. 参考结算书对数表（§12.3）全部通过（除已列出的已知差异）。
4. 自体验 QA 三项（§1.5）通过，变更记录完整。
5. 除 `docs/v2-design.md` 外，设计阶段无其他文件改动（第 1 阶段交付标准）。

---

## 附录 A：参考结算书关键数值锚点（实测，非转述）

- 工程总费用 275517.84 = 建安工程费 265267.65 + 其他费用 10250.19；增值税 0.00。
- 表二折前除税价 512509.64，折后除税价 265267.65；折扣率 37.9%（`54836.58 / 144687.55 = 0.379`）。
- 表二两张表均无安全生产费行；安全生产费在表五甲：`10250.19 = 512509.64 × 2%`。
- 表三甲 41 行（含 `不取费` 2 行：机架内安装光分路器 1:4 / 1:8，工日列为空）；技工合计 1269.189，普工合计 790.666。
- 表三乙 5 行（均对应表三甲成端/接续定额，机械为光纤熔接机，单价 144.00），小计 5580.00。
- 表三丙 8 行（激光测距仪 / GPS 定位仪 / 光时域反射仪），合计 15455.26。
- 表四甲 16 行甲供材料，甲供小计 = 总计 74246.30；无乙供分组；光分路器 1:4 / 1:8 两行备注 `移交县公司`；增值税列全部为空，含税价 = 除税价。
- 表二折前临时设施费 `人工费X5%`（= 35km 以上费率）；折后表临时设施费为空。
- 编制人 `adu`，编制日期 2026-05-13，工程编号 `9MA24CE0000019`。

## 附录 B：未决问题（会阻塞后续阶段，需主代理/用户确认）

| # | 问题 | 阻塞哪个增量 | v2 暂行方案 |
|---|---|---|---|
| Q1 | 预算书各表标题字样（“预算书 / 总预算表 / 费用预算表”）需对照 451 号文编制规程确认，参考文件是结算口径不能照抄 | 增量 3（打印导出） | 按 §5.1 表实现，确认后只改标题字符串 |
| Q2 | 表二措施项中样本为空/0 的项（搬运/干扰/临时/夜间/冬雨/水电/特殊/保护/运土/调遣/大机械）是否打折，样本无证据 | 增量 2（打折模型） | **已裁决 (b)：折后=0**（2026-10-14 用户裁决），`discountRule.zeroAfterDiscountKeys`，见 §6.2 + 增量 7 |
| Q3 | 表四甲设备分组位置：作为第三组进表四甲，还是另出表？参考文件无设备分组 | 增量 3 | 作为第三组进表四甲 |
| Q4 | 表五除安全生产费外，其余项默认公式（管理费 2%、设计费 4.5%×1.1、勘察分段）是否保留 | 增量 2 | 保留 v1 公式为默认，全部可配置 |
| Q5 | 折后表销项税额：参考样本为空/0，v2 按折后基数公式计算，是否与打折后口径一致 | 增量 2 | 按 §6.2 公式计算并展示 |
| Q6 | 参考文件字体：LibreOffice 转换后部分中文显示 `Noto Sans CJK SC`，疑似替换字体，需在 WPS/Excel 中打开原 `.xls` 核对一次 | 增量 3 | 统一用宋体/黑体，核对后如需改只改字体名 |
| Q7 | v1 App 打开 v2 数据文件会静默重建丢数据，是否需要在 v1 发布说明中警示 / 在 v2 文件中加版本标记 | 增量 1（迁移） | 依赖 `v1Backup` + 发布说明警示 |
| Q8 | `crosscheck` 夹具 `/tmp/bt/lo_values.json` 缺失（v1“54 通过”不可复现），v2 需重建夹具并进仓库 | 增量 6 | 重建并进 `tests/fixtures/` |

## 增量 1 架构补充（2026-10-14）

> 本节为增量 1（数据模型 + 多配置方案 + v1→v2 迁移）的实施前架构说明，按 §1.2 追加，不改写上文历史章节。与上文不一致处以本节为准（已注明 supersedes）。

### 增量 1.1 数据模型（新增 / 改动的字段与 JSON 结构）

v2 db（`version: 2`）骨架同 §2.2，本增量落地全部字段，不留占位：

```js
{
  version: 2,
  configurationProfiles: [ConfigurationProfile],  // 至少 1 条；顶层 libraries 删除
  projects: [Project],                             // 含 profileId / quantities[].id / table5Overrides
  settings: { company, activeProfileId, defaultInfo },
  v1Backup: null | { migratedAt, v1Db },           // 迁移时写一次，之后永不覆盖
  meta: { saveVersion: 0 },                        // ★ 本增量新增：增量保存的乐观锁版本号，每次成功保存 +1
}
```

- `ConfigurationProfile`：`id / name / description / createdAt / updatedAt / source / isBuiltIn` + `libraries`（8 张库表，全部行带稳定 `id`）+ `rates`（`byProjectType` 具名字段 + `winterTable` + `vatRates{jiaTax, yiTax, outputTax, safetyVat}`）+ `discountRule{discountRate, noDiscountKeys, zeroAfterDiscountKeys, methodText}` + `table5Fees[14]` + `dispatch{priceTable, peopleEquip, peopleLine, extraPer200km, extraPeopleStep}`。字段语义与 §2.2.1 一致。
- `Project`：新增 `profileId`（必填）、`quantities[].id`（必填）、`table5Overrides: [{key, amount, enabled}]`（null = 用配置）；`rateOverrides` 显式收拢为 `{discount, jiaTax, yiTax, outputTax, safetyVat, taxRate}`（`taxRate` 为 v1 兼容字段，写入时同步 `yiTax`/`outputTax`，读取时 `yiTax` 优先）；新增 `warningsDismissed: []`。
- 取值优先级（§2.4）由纯函数 `resolveRates(profile, project)` 落地（见 §增量 1.3），引擎在增量 2 接入；本增量内该函数仅供测试与后续增量调用，不改 `calc.mjs`。
- 与 §2.2.1 的两处澄清（supersedes §2.2.1 对应表述）：
  1. `table5Fees` 中 `designTotal`（勘察设计费合计）行的 `basis` 取 `'sum'`（= 5.1 + 5.2 之和，不独立取费）。§7.3 的 basis 枚举未列出 `sum`，此处补充：`sum` 仅用于 `designTotal` 这一行。
  2. 库行 `id` 生成用确定性 `<kind>_<序号>`（如 `quota_0`、`short_12`、`mach_3`）替代 `uid()` 随机生成。同输入同输出、可复现；唯一性由迁移测试保证。用户侧新建行（UI 中新增）仍用 `uid()`。

### 增量 1.2 模块划分（改哪些文件、新哪些文件）

| 文件 | 动作 | 职责（本增量） |
|---|---|---|
| `src/engine/rates.mjs` | 新 | 费率模型纯函数：`RATE_FIELD_DEFS`、`rateGridToRates`、`ratesToRateGrid`、`rateForNamed`、`winterRateForNamed`、`RATE_GRID_N_TO_KEY`。无依赖，可 Node 直测。 |
| `src/lib/profiles.js` | 新 | 配置方案管理纯函数（主进程与渲染进程共用，无 Electron 依赖）：`seedToProfile`、`v1LibrariesToProfile`、`migrateV1ToV2`、`migrateSelfCheck`、`getProfile`、`activeProfile`、`profileLibraries`、`profileToLibs`、`resolveRates`、`applySavePatch`、`exportProfile`、`importProfile`、`createProfile`、`duplicateProfile`，以及 `DEFAULT_TABLE5_FEES` / `DEFAULT_DISCOUNT_RULE` / `DEFAULT_DISPATCH` / `DEFAULT_NO_DISCOUNT_KEYS`。 |
| `electron/dbStore.cjs` | 新 | 文件层纯 IO（仅依赖 `fs`/`path`，不依赖 Electron，可 Node 直测）：`atomicWriteFileSync`（写临时文件 → `fsync` → `rename`）、`writeV1BackupSync`、`listV1Backups`、`pruneRollingBackupsSync`（只清 `budget-data.backup-*`，永不碰 `v1-backup-*`）、`rollbackToV1BackupSync`（回滚前先把当前 v2 存为 `budget-data.v2-before-rollback-<戳>.json`）、`shouldBackup`（≥1 小时或重大操作才备份）。 |
| `electron/main.cjs` | 改 | db v2 加载 + 迁移（`loadDb()` 改为 async，窗口创建前完成）；`db:get` 失败返回 `{error}`；新增 `db:savePatch`、`db:reload`、`app:getVersion`；`db:save` 保留兼容（内部走原子写 + 备份节流）；`saveDb` 改原子写 + 备份节流。 |
| `electron/preload.cjs` | 改 | 暴露 `savePatch` / `reloadDb` / `getVersion`；其余通道不变。 |
| `src/lib/store.js` | 改 | `calcLibs(db, project)` 按 `project.profileId` 解析方案（`getProfile` + `profileToLibs`），v1 db 走兼容分支；新增 `getLibraries(db, projectOrProfileId)` 供页面取当前方案库；`newProject` 补 `profileId` / `quantities[].id` / `rateOverrides` / `table5Overrides` / `warningsDismissed`；`uid` 改为从 `profiles.js` 重导出（单一来源）。 |
| `src/App.jsx` | 改 | `updateDb` 改为分支级补丁 + `db:savePatch`（见 §增量 1.3）；`getDb` 返回 `{error}` 时进错误态（重试按钮走 `db:reload`）；不做 saveQueue 节流（B3 完整修复属增量 5，本增量只做到“不发全量保存”）。 |
| `src/pages/Settings.jsx` | 改（最小接线） | 读/写当前激活方案的库（`profile.libraries`），不再读 `db.libraries`；定额改/删按 `id` 定位（B7）；费率 Tab 改为具名字段读写（`rates.byProjectType` + `rates.vatRates` + `rates.winterTable`）；新增定额带 `id`。`exportConfig` 的 Blob 下载问题（B1）本增量不动，归增量 5。 |
| `src/pages/Projects.jsx` | 改（最小接线） | 列表新增“配置方案”列（按 `profileId` 查方案名）+ 按方案筛选；其余不变。 |
| `src/pages/Batch.jsx` | 改（最小接线） | `db.libraries.*` 改为 `getLibraries(db)`；导入工程量行补 `id`。批量操作完整重做归增量 4。 |
| `src/pages/ProjectDetail.jsx` | 改（最小接线） | `db.libraries.*` 改为 `getLibraries(db, project)`；工程量行改/删按 `id` 定位（B7），新增行补 `id`，行 `key` 改用 `id`。工作台重做归增量 5。 |
| `src/engine/calc.mjs` | 不动 | 计算引擎口径属增量 2。本增量 `profileToLibs` 会合成一份 `rateGrid` 兼容垫片供 v1 引擎读取（见 §增量 1.4），引擎本身零改动。 |
| `electron/excel.cjs` | 不动 | 打印导出属增量 3；导入/导出函数本增量不改。 |
| `tests/migration.test.mjs` | 新 | v1→v2 迁移、备份保留、回滚、计算对照（见 §增量 1.5）。 |
| `tests/savepatch.test.mjs` | 新 | `applySavePatch` 成功 / 冲突 / 方案级 / 工程级 / 非法补丁 + `resolveRates` 优先级 + 费率往返。 |
| `package.json` | 改 | `test` 脚本追加两个新测试文件。 |

### 增量 1.3 接口（函数签名、IPC 通道）

```js
// src/engine/rates.mjs
rateGridToRates(rateGrid) -> { byProjectType: { [PROJECT_TYPE]: { techPrice, laborPrice, … } } }
ratesToRateGrid(rates) -> rateGrid  // 逆向合成，供 v1 引擎读取的兼容垫片；winterRate 一律写 null（引擎走 winterTable）
rateForNamed(rates, projectType, key) -> number | null
winterRateForNamed(rates, projectType, region) -> number  // byProjectType[type].winterRate 非 null 则用它，否则查 rates.winterTable[region]
// RATE_FIELD_DEFS: [{key, name, unit, gridN}]，gridN = v1 RATE_ITEMS 的 HLOOKUP 行号 n（taxRate 无对应字段，不在 defs 中）
// RATE_GRID_N_TO_KEY: {3:'techPrice', 4:'laborPrice', …, 26: undefined}（供 Settings 按 n 映射）

// src/lib/profiles.js
seedToProfile(seed, name='默认配置', opts?: {defaultInfo, id, source, isBuiltIn}) -> profile
  // seed 为 seed.json 形状；显式忽略 seed.infoDefaults（§2.4），默认值取 opts.defaultInfo（施工折扣 1 / 甲供 0.13 / 乙供 0.09）
v1LibrariesToProfile(libraries, settings, opts?) -> profile  // id='prof_default', name='默认配置', source='migrated-v1'
migrateV1ToV2(v1db) -> v2db            // 纯函数：备份进 v1Backup、生成方案、工程补 profileId/行 id、删顶层 libraries
migrateSelfCheck(v1db, v2db) -> {ok, failures[]}  // 行数逐项相等、profileId 非空、id 唯一、费率全量对照、v1Backup 深相等、无顶层 libraries
migrateProject(project) -> project     // 单工程迁移（补 profileId / 行 id / rateOverrides 归一化 / table5Overrides / warningsDismissed）
getProfile(db, profileId) -> profile | null
activeProfile(db) -> profile | null    // settings.activeProfileId 命中失败时回落到 configurationProfiles[0]
profileLibraries(db, projectOrProfileId?) -> libraries | null  // v2 按方案取，v1 取 db.libraries
profileToLibs(profile) -> libs         // 供 calcProject 的 libs：含 rates/discountRule/table5Fees/dispatch + rateGrid 兼容垫片
resolveRates(profile, project) -> {discount, jiaTax, yiTax, outputTax, safetyVat}  // §2.4 优先级
applySavePatch(db, {profileId?, projectId?, patch, baseVersion?}) -> {ok:true, version, db} | {ok:false, conflict?, error?, version}
  // patch 键白名单：profile（需 profileId 或 profile.id，按 id 替换）/ project（需 projectId 或 project.id）/
  //   configurationProfiles（整数组替换）/ projects（整数组替换）/ settings（整个替换）/ settingsPatch（浅合并）
  // baseVersion 与 db.meta.saveVersion 不匹配 → {ok:false, conflict:true}，不改数据；成功则 saveVersion +1
exportProfile(profile) -> {profileFormat: 1, exportedAt, profile}
importProfile(json) -> profile         // 校验 profileFormat===1 + 必备字段；失败抛 Error；成功赋新 id、source='imported'
createProfile(name, seedLibs?) -> profile
duplicateProfile(profile) -> profile   // 新 id、名 +“（副本）”、source='user-created'、isBuiltIn=false
```

IPC（`electron/main.cjs` + `preload.cjs`，其余通道不变）：

| 通道 | 入参 | 出参 | 说明 |
|---|---|---|---|
| `db:get` | — | `db` 或 `{error}` | 加载/迁移失败时返回 `{error}`，不再抛未捕获异常 |
| `db:reload` | — | `db` 或 `{error}` | 重新执行 `loadDb()`（供错误态“重试”按钮） |
| `db:save` | `db` 全量 | `true` | 保留兼容；内部走原子写 + 备份节流，`saveVersion` +1 |
| `db:savePatch` | `{profileId?, projectId?, patch, baseVersion?, major?}` | `{ok, version}` 或 `{ok:false, conflict:true, version}` / `{ok:false, error}` | 增量保存；`major=true` 时强制滚动备份 |
| `app:getVersion` | — | `{version, dbVersion}` | 供“关于”与报错信息展示 |

渲染进程 `App.jsx` 的 `updateDb(fn)` 流程：取当前 db → 深拷贝 → `fn(next)` → 对 `configurationProfiles / projects / settings` 三个分支做 JSON 对比，只把变化的分支放进 `patch` → 乐观 `setDb(next)` → 调 `savePatch({patch, baseVersion: prev.meta.saveVersion})` → 成功则同步本地 `meta.saveVersion`；冲突则重拉 `getDb()`、在新数据上重放 `fn`、用新 `baseVersion` 重试一次；重试仍失败则重拉覆盖本地。`patch` 为空（`fn` 未改变任何分支）时不发保存。

### 增量 1.4 影响面

- **旧功能**：全部页面在 v2 db 下继续工作（Settings/Projects/Batch/ProjectDetail 做了最小接线，见 §增量 1.2）。`calc.mjs` 零改动，引擎口径与 v1 完全一致（`safetyFee` 仍为 1.5% 公式、表一仍为快捷折扣公式），口径变更全部留给增量 2；迁移自检的计算对照因此要求**全量相等**（不排除安全生产费/折扣两项——那两项预期差异是增量 2 引擎切换后才出现的）。
- **旧测试**：引擎 12 + Excel 13 不改代码、不改断言，必须仍通过；crosscheck 因 `lo_values.json` 不存在跳过（已知情况，见 §12.2 / 附录 B Q8，归增量 6 重建夹具）。
- **旧数据**：v1 文件在 `loadDb()` 时自动迁移；迁移前先把原文件完整复制为 `budget-data.v1-backup-<时间戳>.json`（永不自动删除）；迁移自检失败则不写回、界面进错误态；回滚 = 用 v1 备份覆盖 `budget-data.json` 后重启（回滚前自动把当前 v2 存为 `budget-data.v2-before-rollback-<戳>.json`）。`version > 2` 拒绝加载。v1 App 打开 v2 文件会丢数据的问题（附录 B Q7）仍由 `v1Backup` + 发布说明兜底，本增量不改 v1。
- **已知限制（本增量有意不做，归后续增量）**：① `profile.rates.byProjectType[type].winterRate` 非 null 覆盖值已存但 v1 引擎不消费（引擎仍查 `winterTable`），增量 2 引擎切换后才生效；迁移时该字段恒为 null，故行为无变化。② 渲染进程 `updateDb` 仍做整库深拷贝 + 分支 JSON 对比（B3 的 saveQueue 节流与无深拷贝属增量 5）。③ `Settings` 配置导入导出仍走旧 Blob 方式（B1 属增量 5）。④ 配置方案管理页（`Profiles.jsx`）属增量 4，本增量只提供纯函数。

### 增量 1.5 验证（本增量交付时执行）

- `npm test`：引擎 12 + Excel 13 仍通过；crosscheck 跳过（夹具缺失，已知）；新增 `tests/migration.test.mjs`（v1 快照 → v2、备份保留、回滚、计算对照）与 `tests/savepatch.test.mjs`（成功 / 冲突 / 方案级 / 工程级 / 非法补丁 / 费率往返 / `resolveRates` 优先级）全部通过。
- 迁移计算对照：同一工程用 v1 libs 与 `profileToLibs(profile)` 各算一次，`table3A` 工日、`table2.exclTax`、`table4A.totalExcl`、`table3B/C.total` 全量相等（容差 0.011）。
- `grep -r "db.libraries" src/` 应只剩兼容分支（`store.js` 的 v1 兼容 + `Settings` 的回落分支），无页面直接依赖顶层 `libraries`。

## 增量 2 架构补充（2026-10-14）

> 本节为增量 2（计算引擎口径：打折模型、安全生产费、汇总表口径、表五可配置）的实施前架构说明，按 §1.2 追加，不改写上文历史章节。与上文不一致处以本节为准（已注明 supersedes）。

### 增量 2.1 数据模型（新增 / 改动的字段与 JSON 结构）

- **不新增持久化字段**。本增量只消费增量 1 已落地的字段（`profile.rates` / `profile.discountRule` / `profile.table5Fees` / `project.table5Overrides` / `project.rateOverrides`），不改 db 结构、不做数据迁移。旧 v1 形状的 `libs`（仅 `rateGrid` + `winterTable`，无 `rates`/`discountRule`/`table5Fees`/`dispatch`）仍被引擎接受，走回退默认值（见 §增量 2.3），保证旧测试与旧调用方不改代码仍能跑。
- 取值优先级（§2.4）在引擎内的落地：折扣/增值税率用 `profiles.js` 的 `resolveRates`（增量 1 已有），即 `rateOverrides > info > 配置方案 > 兜底`；具名费率用 `rates.mjs` 的 `rateForNamed` / `winterRateForNamed`（增量 1 已有）；表五费用项用 `table5Fees` + `project.table5Overrides`（`amount`/`enabled` 单项覆盖，`null` = 用配置）。
- `result.warnings[]` 新增三种警告（`{code, message, rowIds?}`，`rowIds` 为工程量行 `id`，缺 `id` 时用 `qty_<下标>`）：
  - `orphanQty`：工程量行引用的定额编号不在方案定额库中；该行不参与任何计算（工日、材料、勘察长度、调遣），但保留在工程量表中。
  - `invalidQty`：工程量行数量为负数，或工日系数 `coef` 为非正数；该行不参与计算。
  - `duplicateCode`：定额库中同一 `code` 出现多次；计算按首条匹配（沿用 v1 行为），警告提示去重。
  - 另有 `missingRate:{key}`（具名费率缺字段）、`unknownProjectType`（工程类型不在五类中，费率按 0 算）、`invalidDiscount`（折扣率不在 (0,1]，按 1 算）。`validate.mjs`（§3.1）本增量不建：上述警告在 `calc.mjs` 内联实现，独立校验模块随增量 4/5 的库管理/UI 接线时再抽取。
- 表五 `sum` 语义补充（supersedes §7.3 basis 枚举未定义求和子项）：`basis='sum'` 的行，其求和子项取 `item.children`（如配置中给出），未给出时 `designTotal` 默认求和 `['surveyFee', 'designFee']`。总计排除规则：`sum` 行的子项（仅当该 `sum` 行启用时）与 `productionPrepFee`（总计之后单独行）不计入总计；若 `sum` 行被禁用，其子项直接计入总计。

### 增量 2.2 模块划分（改哪些文件、新哪些文件）

| 文件 | 动作 | 职责（本增量） |
|---|---|---|
| `src/engine/discount.mjs` | 新 | 打折模型纯函数（§6.2）：`applyDiscount(before, rule)`、`DISCOUNT_LINE_DEFS`、`DEFAULT_NO_DISCOUNT_KEYS`、`renderMethodText`。不依赖 calc，可独立单测。 |
| `src/engine/calc.mjs` | 改（重写口径部分） | 删除 v1 折扣快捷公式、安全生产费 1.5%+9% 公式、汇总表 `×0.4`/自购物资公式；删除 `rateFor`/`winterRateFor`（改用 `rates.mjs` 具名读取）与 `RATE_ITEMS` 的手写表（改为由 `RATE_FIELD_DEFS` 派生，仍保留 `RATE_ITEMS` 兼容导出供 `Settings.jsx` 使用，增量 4 费率页重做时再删）；删除 `DISPATCH_*` 硬编码常量（改读 `libs.dispatch`，缺失时用 `DEFAULT_DISPATCH`）；新增 `table2Before`/`table2After`、`table5.rows`、`warnings[]`。表三/表四/调遣公式、勘察分段公式原样保留。 |
| `src/lib/profiles.js` | 改（最小） | `DEFAULT_NO_DISCOUNT_KEYS` 改为从 `discount.mjs` 导入并重导出（单一来源，消除两份清单漂移）。其余不动。 |
| `src/lib/store.js` | 改（注释） | `calcLibs` 注释更新：引擎不再读 `rateGrid` 兼容垫片（`profileToLibs` 仍合成该字段供旧调用方兼容，引擎忽略）。 |
| `electron/excel.cjs` | 改（最小一致性） | 汇总表导出删除“自购物资”行（§7.2 汇总表无自购物资行，总计 = 建安费 + 其他费用）。其余导出逻辑不动（打印导出属增量 3）。 |
| `src/pages/ProjectDetail.jsx` | 改（最小一致性） | 汇总表展示删除“自购物资”行，与新口径一致。其余不动（工作台重做属增量 5）。 |
| `tests/discount.test.mjs` | 新 | 打折模型（参考样本逐项，见 §增量 2.4）+ 安全生产费 + 汇总表口径 + 打折规则可定制 + 孤儿警告 + `winterRate` 覆盖。 |
| `tests/crosscheck.test.mjs` | 改（口径调整） | 表一含税（`taxAfter` 改按折后销项税额）、表五（安全生产费 1.5%→2%+VAT 0）、汇总表（新口径）三处断言按新口径换算期望值；其余断言不动。crosscheck 仍因夹具缺失跳过（附录 B Q8，归增量 6），换算后的断言在夹具重建时验证。 |
| `package.json` | 改 | `test` 脚本追加 `tests/discount.test.mjs`。 |
| `tests/engine.test.mjs` / `tests/excel.test.mjs` / `tests/migration.test.mjs` / `tests/savepatch.test.mjs` | 不动 | 经核查：三者均无断言旧错误公式（`engine`/`excel` 仅在折扣=1 下断言自洽值或日志；`migration` 断言两条 libs 路径相等，不 assert 旧值；`savepatch` 不碰引擎）。旧口径断言实际全部位于 `crosscheck`（上条）与将被删除的 v1 公式本身。 |

### 增量 2.3 接口（函数签名）

```js
// src/engine/discount.mjs
applyDiscount(before, rule) -> table2After
  // before：table2Before（全部费用项折前值，含 dispatchUnit/dispatchPeople 等信息项）
  // rule：{ discountRate: (0,1], noDiscountKeys?: string[], outputTaxRate?: number, jiaTax?: number }
  //   outputTaxRate/jiaTax 用于按 §6.2 计算折后销项税额；缺失时销项税额保持折前值（calc 恒提供税率）。
  //   discountRate 非法（<=0 / >1 / 非数字）时抛 Error；calc 在调用前校验并记 invalidDiscount 警告后按 1 计算。
  // 规则：明细项 ∈ noDiscountKeys → 保持折前值，否则 ×折扣率（逐项 r2）；
  //   合计项（laborTotal/mainMat/matTotal/directFee/measureFee/directTotal/regFee/indirectTotal/exclTax）
  //   一律由折后明细加总，不直接乘折扣率；
  //   销项税额 = r2((exclTax-jiaMat)×outputTaxRate + jiaMat×jiaTax)（基数取折后值）；
  //   含税价 = 除税价 + 销项税额；dispatchUnit/dispatchPeople 原样透传。
  // 父子联动：noDiscountKeys 中的合计项 key 会使其子项同样不打折
  //   （mainMat → jiaMat/yiMat；regFee → sewageFee/socialFee/housingFee/accidentFee），
  //   因为合计项本身由明细加总，单独声明合计项不打折而不声明子项是无意义的。
  //   反之，子项 ∈ noDiscountKeys 而合计项 ∉ 时，合计 = 明细和（仍由子项决定）。
  // 未在 DISCOUNT_LINE_DEFS 中的 before 额外数值 key（如某配置表二内含 safetyFee 行）：
  //   按同一规则处理（∈ noDiscountKeys 则保持，否则 ×折扣率），§5.2 的 safetyFee-in-表二情形即属此列。
DISCOUNT_LINE_DEFS: [{ key, label, kind: 'leaf'|'total', methodBefore, methodDiscounted, methodRestored }]
  // 方法列模板（§6.4）：methodDiscounted = 该项被打折时的方法列；methodRestored = 该项不打折时的方法列
  //   （不打折项的方法列按参考写法带 ÷折扣率，如文明施工费 '人工费X{civilRate}%/{discountPct}%'；
  //   参考中打折但方法列不带后缀的项（点交/车辆/工具/企管/利润/规费子项），methodDiscounted = methodBefore，不统一追加后缀）。
DEFAULT_NO_DISCOUNT_KEYS: ['mainMat','auxMat','civilFee','regFee','socialFee','housingFee','accidentFee','sewageFee','safetyFee']
renderMethodText(def, mode /* 'discounted'|'restored' */, vars /* {techPrice, laborPrice, auxRate, …, discountPct} */) -> string
  // 占位符替换；discountPct = discountRate×100（去浮点噪声，如 0.379 → 37.9）。

// src/engine/calc.mjs（签名不变）
calcProject(project, libs) -> {
  info, rate, techSub, laborSub, adjRate, techDays, laborDays,
  table3A, table3B, table3C, table4A, table4B, table4Equip,
  table2Before, table2After, table2 /* = table2After（兼容旧调用方） */,
  table5: { rows: [{key,name,basis,rate,vatRate,amount,excl,vat,incl,enabled,order,note}],
            totalExcl, totalVat, totalIncl,
            mgmt2, mgmt2Vat, mgmt2Incl, surveyKm, surveyFee, surveyVat,
            designFee, designVat, designTotal, designTotalVat,
            safetyFee, safetyVat, safetyIncl,
            productionPrepFee, productionPrepVat, productionPrepIncl },
  table1: { beforeDiscount, afterDiscount, taxBefore, taxAfter, totalBefore, totalAfter,
            otherFee, otherVat, otherIncl, sumExcl, sumVat, sumIncl,
            equipFee, equipVat, equipIncl, grandExcl, grandVat, grandIncl },
  summary: { constructionExcl, constructionVat, constructionIncl,
             other, otherVat, otherIncl, totalExcl, totalVat, totalIncl } /* 无 selfMat（§7.2） */,
  warnings: [{code, message, rowIds?}],
  discount /* 生效折扣率 */, discountRule /* 生效打折规则 {discountRate, noDiscountKeys} */,
  surveyKm, surveyRaw,
}
// 口径要点：
// - 表二：先算 table2Before（等价于 v1 在 discount=1 时的表二），再调 applyDiscount 得 table2After；
//   表一/表五/汇总表全部以 table2Before/table2After 为输入，不各自再算折扣。
// - 表五：逐项按 table5Fees[].basis 取费（preDiscountExclTax / afterDiscountExclTax / laborTotal(折前人工费) /
//   fixed / manual / surveyKm(勘察分段) / sum）；单项 vatRate 缺失时 safetyFee 回落到 rates.vatRates.safetyVat，其余回落 0；
//   安全生产费 = table2Before.exclTax × safetyFee 项 rate（默认 0.02）+ 增值税（默认 0）。
// - 汇总表：constructionExcl = table1.afterDiscount = table2After.exclTax；other = table5.totalExcl；
//   totalExcl = constructionExcl + other；VAT 列 = taxAfter + otherVat；含税 = 除税 + VAT。
// - 费率：具名读取（libs.rates 优先；无 rates 但有 rateGrid 时经 rateGridToRates 转换；两者皆无则全 0 + missingRate 警告）。
//   winterRate：byProjectType[type].winterRate 非 null 则直接用（覆盖值 0 是显式 0），null 则按地区查 winterTable。
// - 折扣/增值税率解析以原始 project.info 为准（不经 DEFAULT_INFO 合并），故 §2.4 的配置方案层级有效
//   （info 缺字段时取 profile 值）；返回的 info 为 DEFAULT_INFO 合并后的回显，仅供展示，
//   生效值以返回的 discount / rate（jiaTax/yiTax/outputTax/taxRate）为准。
```

### 增量 2.4 与参考结算书的对照（实测，非转述）

实施前已用 LibreOffice 转换参考文件并逐项实测（源文件 `~/workspace/user/files/2024__________________31_-9MA24CE0000019.xls`）。以下两处**参考值与设计文档 §6.2 默认规则不一致**，属于设计文档内部矛盾，本增量按任务指令执行 §6.2 默认规则（Q2：11 项默认打折），差异如实记录、由主代理裁决，不在测试中掩盖：

1. **Q2 的 11 项措施（搬运/干扰/临时/夜间/冬雨/水电/特殊/保护/运土/调遣/大机械）**：参考折前表有值（合计 45850.06），参考折后表**全部为空**（即折后 = 0，不计入）。按 §6.2 默认“打折”算，折后措施 = 27436.31、折后除税价 = 282644.82，与参考折后措施 10059.14、折后除税价 265267.65 相差 17377.17（= 11 项逐项打折后之和）。§12.1/§12.3 中“折后措施 10059.14、折后除税价 265267.65”的断言，在 §6.2 默认规则下**无法**由完整参考折前表得出；本增量测试用“11 项置 0 的参考折前表”验证 §12.1 其余逐项值，并另立一测试用完整参考折前表断言该 17377.17 差额（即差额本身可复现、可验证）。若主代理裁决改为“11 项折后不计（=0）”，只需在 `discount.mjs` 增加第三种处理（或由配置指定），引擎与测试按裁决同步改，不动其他口径。
2. **折后规费子项**：参考折后表社保/公积金/危伤显示**打折后值**（20838.06/3063.56/731.16 = 折前子项 ×0.379），规费合计显示**还原值**（64994.14 = 子项折后和 ÷0.379）。本增量按 §6.2 `noDiscountKeys` 含规费子项执行：子项 = 折前值（54981.68/8083.27/1929.18），合计 = 子项和 = 64994.13（与参考合计差 0.01，属 §6.5 预期舍入差，容差 0.02 覆盖）。子项值的差异是模型定义所致（§12.1/§12.3 均未断言折后子项值），不在本增量解决；若主代理要求子项也按参考显示打折后值，则需 §6.2 改为“子项打折、合计还原”的特殊规则。
3. 其余参考对照均与 §6.2/§7 一致（已实测）：逐项打折值（技工 54836.58 / 普工 18279.41 / 机械 2114.82 / 仪表 5857.54 / 点交 2412.83 / 车辆 3655.80 / 工具 1096.74 / 企管 20033.78 / 利润 14623.20）、文明不打折 2893.77、主材/辅材不打折、安全生产费 10250.19 = 512509.64 × 2%、折后销项税额按公式（Q5，参考为空，v2 按公式算出并展示，属已知差异）。

### 增量 2.5 影响面

- **旧功能**：`ProjectDetail.jsx` / `Batch.jsx` / `Projects.jsx` / `excel.cjs` 读 `result.table2`（= 折后）、`table1`、`table5` 扁平字段、`summary`——扁平字段全部保留，仅 `summary.selfMat*` 删除（两处消费方同步删行，见 §增量 2.2）。折扣 <1 的工程，界面与简易导出显示的表二即为折后表（与 §3.1.1 `table2 = table2After` 一致）。
- **旧测试**：见 §增量 2.2 表。`crosscheck` 的三处口径换算（表一含税 +甲供增值税、表五安全生产费 1.5%→2%+VAT 0、汇总表新口径）在夹具重建（增量 6）时验证；本增量内 crosscheck 仍跳过。
- **旧数据**：无迁移。v1 libs（仅 rateGrid）走回退路径，结果与 v1 引擎在 discount=1 时一致，除两处有意变更：安全生产费（1.5%+9% → 2%+0）与汇总表（旧公式 → §7.2 新口径）。`migration.test.mjs` 的“两条 libs 路径相等”断言不受影响（两条路径均走新引擎、同一口径）。

## 增量 3 架构补充（2026-10-14）

> 本节为增量 3（打印导出：11 张表按版式规格生成）的实施前架构说明，按 §1.2 追加，不改写上文历史章节。与上文不一致处以本节为准（已注明 supersedes）。
> Q2（11 项措施打折默认）正由主代理裁决，本增量不重新决策：只按当前引擎输出渲染；若裁决改变规则，只改引擎值，不动导出代码。

### 增量 3.1 数据模型（新增 / 改动的字段与 JSON 结构）

- **不新增持久化字段，不改 db 结构，不做数据迁移。** 导出是纯渲染：输入 = `project`（工程记录，含 `info` / `quantities`）+ `result`（`calcProject` 返回值，含 `table2Before` / `table2After` / `table5.rows` / `table1` / `table3A/B/C` / `table4A/B/Equip` / `techDays` / `laborDays` / `discountRule` / `rate`）+ `profile`（工程所属配置方案，可为 null；用于取材料库 `remark` 与定额/映射库做变体级重建）。输出 = 11 张表的 `.xlsx` 文件（数值单元格为数值型，无公式）。
- **表三甲/乙/丙的变体级行（supersedes §5.2“数据行取 table3X.rows”的字面读法）**：引擎 `table3A` 按定额编号汇总（一行一编号），无法满足 §5.2 表三甲“定额编号可重复，不合并”“`工日X0.5` 类变体行项目名称原样输出（含后缀）”的要求。因此导出时按 `(定额编号, 变体)` 对 `project.quantities` 重新分组（首次出现顺序；孤儿/无效/零数量行按引擎规则排除），每组数量 = Σ(数量×系数)，工日 = 数量×定额单耗（`r2` 与引擎一致），项目名称 = 定额库 `name` +（变体非空时 `' ' + variant`）。分组求和与引擎按编号汇总的合计完全一致（同一组数量的两种划分），合计行仍取 `result.techDays` / `result.laborDays`（含调整），调整非 0 时合计行下方以小字备注“其中调整 +X 工日”（§5.2）。表三乙/丙同理按 `(编号, 变体)` × 定额—机械/仪表映射重建（小计/合计与引擎一致）。`profile` 为 null 时回落到引擎 `table3X.rows`（聚合粒度，名称原样），保证无方案上下文时仍可导出。
- **孤儿行（§11）**：`project.quantities` 中引擎已排除的孤儿行仍渲染进表三甲（不丢数）：`quota === '不取费'` 或含“不取费”/“预留”字样时定额编号列写 `不取费`、工日列为空、项目名称取变体或编号原文；其余孤儿行定额编号列写原编号、工日列为空。导出前弹窗提示孤儿行数量属 UI 动作，归增量 5 工作台；本增量只负责渲染。
- **零值渲染规则**：金额/工日/台班/数量为 0 的单元格输出空单元格（参考文件惯例：表二排污/运土/特殊、表五空项、表三甲空工日均为空白），合计行亦同。封面“工程造价”文本除外（恒为 `#,##0.00元` 文本）。
- **数值格式（numFmt）**：表二/表一/汇总/表五金额 `#,##0.00`；表三甲数量与工日 `0.000`；表三乙/丙数量与台班 `0.000`、单价与合价 `#,##0.00`；表四甲数量 `#,##0.000`、单价 `#,##0.00000`（参考单价 5 位小数，如 0.67714）、合计 `#,##0.00`。导出代码不重算、不二次舍入，原样写引擎/夹具值。

### 增量 3.2 模块划分（改哪些文件、新哪些文件）

| 文件 | 动作 | 职责（本增量） |
|---|---|---|
| `scripts/genPrintLayout.cjs` | 新 | 版式常量生成器：读 `docs/print-layout-spec.raw.json`，输出 `electron/printLayout.cjs`（列宽/行高/页边距/合并区/表尾行号，逐表）。版式调整只改 raw.json 后重跑生成器，不手写常量。 |
| `electron/printLayout.cjs` | 新（生成） | 版式常量模块（见 §增量 3.3）。 |
| `electron/printExport.cjs` | 新 | 打印导出实现：`exportBudgetBook(filePath, project, result, profile, opts)`，ExcelJS 实现 11 张表；内部 `buildCover / buildNotes / buildSummary / buildTable1 / buildTable2 / buildTable3A / buildTable3B / buildTable3C / buildTable4A / buildTable5` + `applySheetStyle / writeFixedFooter / paginateTable3A`。 |
| `electron/excel.cjs` | 改 | **删除**旧简易版式 `exportProject`（避免两套导出并存漂移）；保留导入函数与 `exportQuotas`。 |
| `electron/main.cjs` | 改 | `excel:exportProject` 通道改为 `excel:exportBudgetBook`：入参 `{filePath, project, result, profileId}`，主进程按 `profileId` 取方案后调 `printExport.exportBudgetBook`，经主进程 `fs` 写真实路径（B1）。 |
| `electron/preload.cjs` | 改 | `window.api.exportProject` 改为 `exportBudgetBook`。 |
| `src/` | 不动 | 渲染进程不改；工作台导出按钮接线归增量 5（届时调 `exportBudgetBook`）。 |
| `tests/print.test.mjs` | 新 | 打印导出结构 + 参考夹具对数 + 引擎值回读 + 分页（见 §增量 3.5）。 |
| `tests/excel.test.mjs` | 改 | 导出断言改为打印导出（11 张表 + 版式），导入断言沿用。 |
| `tests/fixtures/reference-book.json` | 新 | 参考结算书样本夹具（由 `scripts/build_reference_fixture.py` 从 raw.json 机械提取，见 §增量 3.5；夹具取参考实测值，含 Q2/Q5 的参考处理，仅用于版式+映射验收）。 |
| `scripts/build_reference_fixture.py` | 新 | 夹具生成脚本（读 raw.json → 写 fixture，避免手工转录错误）。 |
| `scripts/verify-print-export.mjs` | 新 | LibreOffice 往返验证脚本（导出 → LO headless 转换 → ExcelJS 读回逐项比对；不在 `npm test` 内，LO 在 CI 未必可用，验收时手动跑并记录数字）。 |
| `package.json` | 改 | `test` 脚本追加 `tests/print.test.mjs`。 |

- 与 §3.1 的一处偏离（supersedes §3.1 / §5.4 的文件位置）：版式常量模块落在 `electron/printLayout.cjs`（CJS），而非 `src/engine/printLayout.mjs`（ESM）。原因：主进程 `main.cjs` 需同步 `require` 导出模块；CJS 直接 `require` ESM 在 Electron 主进程不可靠。常量内容与生成方式与设计一致（raw.json → 生成器 → 常量文件）。
- 与 §3.2 的一处偏离：表二“依据和计算方法”列模板不从 `discount.mjs` 的 `DISCOUNT_LINE_DEFS` 运行时导入（同上，CJS/ESM 边界），而是在 `printExport.cjs` 内按 §6.4 自持一份方法模板；`tests/print.test.mjs` 用合成用例逐项比对导出方法列与 `discount.mjs` `renderMethodText` 的输出，锁定两者一致，防漂移。

### 增量 3.3 接口（函数签名、IPC 通道）

```js
// electron/printExport.cjs（CJS，可 Node 直测，不依赖 Electron）
async function exportBudgetBook(filePath, project, result, profile, opts) -> Promise<true>
  // filePath：真实路径（主进程 fs 写，不走浏览器下载，B1）
  // project：工程记录（含 info、quantities）；result：calcProject 返回值；profile：配置方案或 null
  // opts：{ includeSheets?: string[] }（默认 11 张全出）
  // 失败抛 Error（调用方展示错误，不许静默返回 true）
function paginateTable3A(n) -> number[]  // 表三甲分页：首 23、后续每页数据 ≤18（含合计行占 1 槽，末页数据 ≤17）；
//   n≤22 → [n]；n=23 → [23,0]（合计行独占一页）；n=40 → [23,17]（与参考一致）
function table2MethodRows(t2, mode, ctx) -> [{seq, label, method, value}]  // mode 'before'|'after'，供两张表二复用

// electron/printLayout.cjs（生成，CJS）
SHEET_ORDER: [11 个工作表名]；LAYOUT: { [refSheetName]: { colWidths[], rowHeights{}, margins{},
  merged[], maxRow, maxCol, footerRow|null } }

// IPC（electron/main.cjs + preload.cjs）
excel:exportBudgetBook  入参 {filePath, project, result, profileId}  出参 true（失败抛错）
//   主进程按 profileId 从 db 取方案（找不到则传 null，导出回落到引擎 rows）；渲染进程不拼 result 之外的格式。
```

- 版式常量生成：`node scripts/genPrintLayout.cjs`（读 `docs/print-layout-spec.raw.json` → 写 `electron/printLayout.cjs`）；缺失列宽用 raw 的 `default_col_width`（9.1367…），缺失行高用 `default_row_height`（15.2）。
- 边框：raw.json 未提取边框数据（全部为 null），按 §5.2 文字规则实现：表头行上下 medium、数据行 thin 全网格、最右侧列右边框 thin、合并区内逐格写边框；标题/信息/表尾行无边框。
- 字体：参考转换后部分字体为 `Noto Sans CJK SC`（LO 替换，附录 B Q6）；v2 按 §5.5 统一用宋体/黑体（标题宋体 18 加粗、封面标题宋体 36、封面值黑体 18 加粗、编制说明标题宋体 21、正文/数值宋体 10、信息行宋体 9、表尾宋体 10）。

### 增量 3.4 关键版式决策（实现时按此执行，不逐项请示）

1. **表二固定双栏布局**（左右各 19 行，行 5–23）：左栏（建安含税/除税、直接费、直接工程费、人工费、技工、普工、材料费、主材、辅材、机械、仪表、措施、文明、搬运、干扰、点交、临时、车辆）+ 右栏（夜间、冬雨、工具、水电、特殊、保护、运土、调遣、大机械、间接费、规费、排污、社保、公积金、危伤、企管、利润、销项税额、空）。**无环境保护费行**（设计 §5.2 版式 15 项措施不含环保费；`envFee` 仍计入措施项目费合计，见 §6.2 引擎）。折前/折后两张表版式完全一致（列宽/行高/合并区/页边距相同；折前表第 22 行行高 35.30 来自 raw，折后表 20.15）；折后方法列按 `noDiscountKeys`（经 `mainMat→jiaMat/yiMat`、`regFee→4 子项` 联动展开，与 `discount.mjs` 一致）选 `discounted` / `restored` 模板；方法列变量：费率取 `result.rate` 具名字段 ×100（去浮点噪声，如 0.015→1.5），`tempRate` 按 `info.施工距离` 取近/远值，`winterRate` 取生效值，`discountPct` = `discountRate×100`。方法列用 ASCII `%`（设计文档写法；参考用全角 ％，属外观差异）。
2. **汇总表/表一的设备费列（与 §7.2 的衔接）**：§7.2 公式未写设备费列，但两表均有“需要安装的设备费”列且封面工程造价 = `table1.grandIncl`（含设备费）。为使三表平衡（封面 = 汇总表总计 = 表一总计），设备费进 E 列：汇总表 E = `table4Equip.totalExcl`、J = E+G+H、K = 设备增值税 + 建安增值税 + 其他增值税、L = J+K；表一第 7 行 E = 设备费除税价、J = E+G、K = 设备增值税 + 销项税额，第 9 行总计 = E+G+H 三列之和。设备费为 0 时与 §7.2 字面公式完全一致。汇总表 N 列“生产准备及开办费”取 `table5.productionPrepFee` 除税价（参考为空，无反证）。
3. **表格编号**：信息行 `表格编号：-总/-1/-2/-3甲/-3乙/-3丙/-4甲A/-5甲`（表二折前与折后均为 `-2`）；汇总表 B 列与表一 B 列用 `info.表格编号` 作前缀（以 `-` 结尾则直接拼后缀，否则补 `-` 再拼；为空则用 `通信线路-`），后缀：汇总表 `1`、表一第 7 行 `2`、第 8 行 `5甲`（与参考一致）。封面工程编号取 `info.项目编号`（为空则取 `info.表格编号`，仍为空则留空，不编造）。
4. **表五甲**：费用行按 `table5.rows` 的 `order` 排序，`productionPrepFee` 恒在总计之后单独行（不计入总计）；序号取 `order`（5→`5`、5.1→`5.1`、5.2→`5.2`、14→`14`）；方法列：`preDiscountExclTax` → `折前建安工程费除税价X{rate}%`（安全生产费即此规则，§7.1）、`afterDiscountExclTax` → `折后…`、`laborTotal` → `人工费X{rate}%`、`surveyKm` → `按勘察里程分段计取`、`sum` → 子项序号 joined（`5.1+5.2之和`）、`fixed` → `固定金额`、`manual` → 有金额时 `按工程给定金额计取` 否则空；备注列恒为空（参考仅安全生产费行有备注且为金额重复，属样本 peculiarity，v2 不复制）。参考表五方法列除安全生产费外均为空、安全生产费方法列写数值 `10250.19`，v2 按本条写方法表达式（§7.1 已定），属有意差异。
5. **表四甲**：甲供/乙供/设备三组按 `table4A / table4B / table4Equip` 输出，无某组时该组分组头+小计整组省略，总计行恒输出；备注列取 `profile.libraries.materials` 的 `remark`（按 `name|spec` 匹配），未建档（`unmatched`）写 `未建档`，`profile` 为 null 时仅 `未建档` 有值。溢出分页：按 §5.3 通用规则（重复标题+信息行+列头+页码，表尾只在末页）。
6. **表三乙/丙溢出、表五溢出**：同 §5.3 通用规则分页（每页固定行高，表尾只在末页）；表三甲分页见 §增量 3.3（`paginateTable3A`）与 §5.3（每页 29 行，分页符在页末）。
7. **销项税额（Q5）**：只渲染引擎值（`outputTax = (exclTax-jiaMat)×outputTaxRate + jiaMat×jiaTax`，增量 2 口径）。与参考的差异（折前参考 39443.70 = 仅第一项；折后参考为空/0）属已知差异，不在导出层抹平。
8. **编制说明**：一、编制依据 4 条沿用参考文本 + 折扣句（`discountRate<1` 时追加“5.施工折扣按 XX% 计取…”句；`=1` 时不追加）；二、造价分析全部取 `result` 实际值（工程类型 / 距基地里程 `info.施工实际里程` / 总费用 `table1.grandIncl` / 建安费 `afterDiscount` / 设备费 `equipFee` / 其他费用 `otherFee` / 增值税 `grandVat`；小型建筑工程费/不安装设备费/预备费恒 0.00，无引擎字段）。
9. **日期**：`info.编制日期` 有值时格式化为 `YYYY年M月D日`，为空时用导出当天日期；封面日期为空时追加 `（导出日）` 标注，表尾日期不追加。

### 增量 3.5 验证（本增量交付时执行）

- `npm test`：现有测试仍通过（`excel.test.mjs` 导出部分已按打印导出改写）；新增 `tests/print.test.mjs`（断言：11 张表名/顺序、每表列宽/合并区数/打印设置、表尾固定行、页码单元格文本、数值单元格 `data_type === 'n'`、表二两张表版式一致、表四甲三组小计+总计、表三甲分页 40 行→2 页、方法列与 `discount.mjs` 逐项一致、参考夹具对数、引擎值回读、溢出分页）。
- 参考对数（`tests/fixtures/reference-book.json`，参考实测值）：封面 275517.84、汇总表 265267.65/10250.19/275517.84、表一同、表二折前/折后逐项（除 Q2/Q5/规费子项/表五方法列/销项税额五处已知差异外）、表三甲 1269.189/790.666、表三乙小计 5580.00、表三丙合计 15455.26、表四甲 74246.30、表五 10250.19。已知差异清单见 §12.3 + §增量 3.4 第 1/4/7 条，不计入失败。
- LibreOffice 往返：`node scripts/verify-print-export.mjs`（导出夹具 + 合成工程 → `soffice --headless --convert-to xlsx` → ExcelJS 读回逐项比对），记录通过数于变更记录。
- `node --check electron/printExport.cjs electron/printLayout.cjs electron/excel.cjs electron/main.cjs electron/preload.cjs` 通过；`npm run build` 通过。

### 增量 3.6 影响面

- **旧功能**：`excel.cjs` 的 `exportProject` 删除后，渲染进程旧调用（`ProjectDetail.jsx` / `Batch.jsx` / `Projects.jsx` 中如有 `exportProject`）在本增量内同步改为 `exportBudgetBook`（仅改调用点，不改页面逻辑；工作台完整接线归增量 5）。`calc.mjs` / `discount.mjs` / `profiles.js` 零改动。
- **旧测试**：`tests/excel.test.mjs` 导出断言按打印导出改写（旧简易版式断言删除，属有意替换，见 §1.3 变更记录）；其余测试不动。
- **旧数据**：无迁移。已导出的旧简易版式文件不受影响（仅新导出走打印版式）。
- **已知限制（有意不做）**：① 表三乙/丙的变体级重建需 `profile` 的映射库；`profile` 为 null 时回落引擎聚合行。② 真机点按走查（导出按钮→选路径→打开文件）归增量 5 自体验 QA；本增量验证为 Node 直测 + LO 往返。③ 标题字样 Q1（“预算书/总预算表…”）未确认，按 §5.1 表实现，确认后只改标题字符串。

## 增量 4 架构补充（2026-10-14）

> 本节为增量 4（库管理 + 批量操作：导入差异预览 / 导出 / 批量删除；配置方案管理页；撤销栈）的实施前架构说明，按 §1.2 追加，不改写上文历史章节。与上文不一致处以本节为准（已注明 supersedes）。

### 增量 4.1 数据模型（新增 / 改动的字段与 JSON 结构）

- **不新增持久化字段，不改 db 结构，不做数据迁移。** 本增量只读写增量 1 已落地的字段（`profile.libraries` 8 张表、`profile.rates`、`profile.table5Fees`、`profile.discountRule`、`configurationProfiles`、`settings.activeProfileId`）。全部改/删操作按行 `id` 定位（B7）；映射表（`quotaMachines` / `quotaInstruments` / `rules`）改/删同样按 `id`，**禁止**按编号首条匹配（§8.3 分类匹配用业务主键仅用于“导入时找对应行”，落库更新仍按 `id` 写回）。
- **库视图（UI 层概念，不持久化）**：`LIBRARY_VIEWS`（见 §增量 4.2）定义 11 个管理视图，覆盖 10 张存储表。`rules` 一张存储表拆为两个视图：`rulesVariant`（`kind ∈ {变体, 变体*, 通用}`，即 §8.1“定额—材料映射”）与 `rulesAlt`（`kind === 备选`，即 §8.1“关联规则”）；`shortlist`（常用短单）亦有独立视图（§8.1 明确列出，任务清单未单列，本增量一并落地）。视图的 `getRows(profile)` / `setRows(profile, rows)` 做视图 ↔ 存储的转换：`rules` 两视图的 `setRows` 只替换属于本视图的切片（按 `kind` 归属），不触碰另一视图的行；`rates` 视图的 `getRows` 把 `rates.byProjectType` + `winterTable` + `vatRates` 展开为行（`{id, 工程类型, 费率项目, 数值, 单位, _section, _key}`），`setRows` 按 `_section/_key` 写回（`winterRate: null` 语义保留：数值为空即 `null` = 按地区查表，禁止写成 0）。
- **费率视图的行固定**：费率行集合由 `RATE_FIELD_DEFS`（21 项 × 5 类工程）+ 冬雨季 3 行 + 增值税 4 行派生，**不允许新增/删除行**（新增费率项目无引擎语义；删除行会使字段回落 0 并产生 `missingRate` 警告）。导入费率时未知“费率项目”行归入错误组，不落库。
- **撤销快照（内存态，不持久化）**：`{label, scope, profileId?, viewKey?, rowsBefore?, profilesBefore?, settingsBefore?}`。`scope='table'` 时 `rowsBefore` 为该视图操作前的**视图行快照**（最小范围：单视图，不是整库深拷贝；B2 要求“受影响最小范围”）；`scope='profiles'` 时快照整组 `configurationProfiles` + `settings`（删方案/导入方案才用，低频）。撤销 = 把快照写回（经 `updateDb` + `savePatch`，与正常保存同一链路）。撤销栈不进 db、不进磁盘，App 重启即空。
- **导入差异分类结果（内存态）**：`classifyImport(view, existingRows, incomingRows) -> {added, updated, skipped, errors}`，其中 `updated` 每行带字段级 diff `[{field, label, from, to}]`；`errors` 带 `errors: string[]`（必填为空 / 数值非法 / 枚举非法 / 文件内业务主键重复 / 费率未知项目）。`errors` 非空时仍可预览有效行，但“确认导入”置灰，直到用户勾选“我已知晓并跳过错误行”（§8.3）。

### 增量 4.2 模块划分（改哪些文件、新哪些文件）

| 文件 | 动作 | 职责（本增量） |
|---|---|---|
| `src/lib/libraryDefs.js` | 新 | 库视图定义（纯函数，无 Electron/DOM 依赖）：`LIBRARY_VIEWS`（11 视图：列定义 `{key,label,type,options,required}`、业务主键 `businessKey`、行默认值 `newRow()`、视图 `getRows/setRows`、是否可新增/删除/复选）。`src/` 与测试共用，单一来源。 |
| `src/lib/libraryOps.js` | 新 | 库操作纯函数：`getViewRows/setViewRows`（经视图定义）、`businessKeyOf`、`validateRow`、`classifyImport`、`applyImport`（合并/全部替换）、`paginate`、`formatPageRange`、`filterRows`、`sortRows`、`countReferences`（删除影响：定额→引用工程数 + 引用规则数；材料→引用规则数；其余 0）。 |
| `src/lib/undo.js` | 新 | 撤销栈纯函数：`createUndoStack(limit=50)`、`push(snapshot,label)` / `undo()` / `canUndo()` / `size()`。只存数据快照，不存闭包。 |
| `electron/configIO.cjs` | 新 | 配置文件 IO（CJS，`helpers` 参数注入 ESM 的 `profiles.js` 函数，避免 CJS 直接 require ESM）：`exportProfileToFile(filePath, profile, helpers)`、`importProfileFromFile(filePath, helpers)`、`exportConfigBackup(filePath, db)`。全部经 `fs` 写/读真实路径（B1）。 |
| `electron/excel.cjs` | 改 | 新增通用 `importLibrary(filePath, kind)`（按 `kind` 的中文表头映射解析，返回 `{rows, errors}`；行级错误不阻塞有效行）与 `exportLibrary(filePath, kind, rows)`（Excel，列头与导入格式一致；布尔写 `是/否`，导入时反向解析）。保留 `importQuotas` / `exportQuotas`（旧调用方兼容，`importLibrary(kind='quotas')` 与其同表头）。 |
| `electron/main.cjs` | 改 | 新增 IPC：`db:exportProfile`（按 `profileId` 取方案 → `configIO` 写真实路径）、`db:importProfile`（读文件 + `importProfile` 校验 + 名冲突时追加“（导入）”+ 追加进库 + `major` 保存）、`db:exportBackup`（整库 JSON 写真实路径）、`excel:importLibrary`、`excel:exportLibrary`（`.json` 后缀时写 JSON 数组，否则走 `exportLibrary`）。 |
| `electron/preload.cjs` | 改 | 暴露上述 5 个通道。 |
| `src/components/LibraryTable.jsx` | 新 | 通用库表组件（§8.2）：搜索 + 排序（点表头）+ 分页（每页 50/100/200，文案 `共 N 条，显示 M–K 条`，B4）+ 复选（行首 + 表头三态 + 全选本页 / 全选全部）+ 行内编辑（按列 `type` 渲染 input/number/select/checkbox）+ 删除确认（调 `ConfirmDialog`，含 `countReferences` 影响说明）+ 导入/导出/批量删除/新增工具栏。全部库 Tab 复用，不许各 Tab 各写一套。 |
| `src/components/ConfirmDialog.jsx` | 新 | 确认框组件（§8.4）：标题 + 影响说明 + 受影响名称示例（前 5 条）+ “确认删除”（红）/ 取消。删除类操作必须用它，不许直接用 `window.confirm`（本增量内 `window.confirm` 仅保留给“导出全部还是仅筛选”这一非删除选择）。 |
| `src/components/ImportDiffPreview.jsx` | 新 | 导入差异预览（§8.3）：新增/更新（字段级 diff + 逐字段“采用新值/保留旧值”勾选，默认全采用）/ 跳过 / 错误四组 + 每组整组勾选 + 模式选择（合并默认 / 全部替换，替换须输入当前方案名确认）+ 错误行知晓勾选。确认后输出 `decisions` 给调用方落库。 |
| `src/pages/Settings.jsx` | 改（重写为库管理壳） | 方案选择器（切换 `settings.activeProfileId`）+ 11 个库 Tab（复用 `LibraryTable`）+ 打折规则 Tab（`discountRule.discountRate` + `noDiscountKeys` 按 `DISCOUNT_LINE_DEFS` 勾选）。**删除**旧 Blob 下载 `exportConfig`（B1 病灶，连同死代码 `const { ipcRenderer } = { ipcRenderer: null }` 一并删除）与旧 `confirm('点确定=合并…')` 定额导入（§8.3 禁止静默覆盖）。费率 Tab 改为 `rates` 视图（具名字段行 + 增值税率四项可见可改，B8 补齐；`RATE_ITEMS` / `RATE_GRID_N_TO_KEY` 不再被 Settings 使用）。旧 `config` Tab 删除，配置导入导出移到 `Profiles.jsx`。 |
| `src/pages/Profiles.jsx` | 新 | 配置方案管理页（§3.1）：列表（名/来源/创建时间/工程数/是否激活）/ 新建（空白或以选中方案为模板）/ 重命名（行内）/ 复制（`duplicateProfile`）/ 删除（有工程引用时禁止删除，列出工程名 + 一键切换入口，切换后可删；删除前压撤销快照 + `major` 备份）/ 设为新建默认（`settings.activeProfileId`）/ 导出方案（`db:exportProfile` 写真实路径）/ 导入方案（`db:importProfile`，结构与版本校验由 `importProfile` 做）/ 整库备份（`db:exportBackup`）。 |
| `src/App.jsx` | 改 | 持有撤销栈（`useRef(createUndoStack())`）+ Toast（保存成功 / 已撤销 / 导入完成，删除后 Toast 带“撤销”按钮 5 秒有效）+ 顶栏常驻“撤销”按钮（`canUndo()` 时可用，快捷键 `Cmd/Ctrl+Z`）；`updateDb(fn, opts?)` 新增可选 `{major}`（透传 `savePatch({major})`，供批量删除/全部替换导入/删方案触发滚动备份）；新增 `profiles` 路由与导航；`pushUndo` / `notify` 下发给 `Settings` / `Profiles`。 |
| `src/styles.css` | 改 | 新增模态框（`.modal-overlay/.modal`）、Toast（`.toast`）、分页条（`.pagination`）、差异预览（`.diff-*`）、三态复选样式；不改现有视觉风格。 |
| `tests/batch.test.mjs` | 新 | 批量操作测试（§12.1）：导入差异分类（新增/更新/跳过/错误/文件内主键重复）、合并时逐字段采用/保留、全部替换、导出回读（定额/材料/映射/费率/表五，含同编号多行按 `id` 区分）、批量删除按 `id` 只删目标行（重复编号不误伤，B7）、分页显示范围、撤销栈（LIFO/上限 50）、`countReferences` 影响计数、`configIO` 真实路径往返 + 非法 JSON 报错。 |
| `package.json` | 改 | `test` 脚本追加 `tests/batch.test.mjs`。 |
| `src/engine/calc.mjs` | 不动 | `RATE_ITEMS` 兼容导出保留（Settings 不再用它，但旧调用方/测试可能引用；删除属后续清理，不在本增量）。 |
| `src/pages/Batch.jsx` / `Projects.jsx` / `ProjectDetail.jsx` | 不动 | 工程批量操作（批量删工程等）与工作台属增量 5；本增量撤销覆盖库表删除/批量删除 + 方案删除，不含工程删除（已知遗留，见 §增量 4.5）。 |

### 增量 4.3 接口（函数签名、IPC 通道）

```js
// src/lib/libraryDefs.js
LIBRARY_VIEWS: [{ key, label, storage, columns: [{key,label,type,options?,required?}],
  businessKey: string[], allowAdd, allowDelete, selectable,
  getRows(profile) -> rows, setRows(profile, rows) -> profile(新对象),
  newRow() -> row }]
// view.key 枚举：quotas | shortlist | materials | rulesVariant | rulesAlt | machinePrices |
//   instrumentPrices | quotaMachines | quotaInstruments | rates | table5Fees

// src/lib/libraryOps.js
getViewRows(profile, view) -> rows
setViewRows(profile, view, rows) -> profile
businessKeyOf(view, row) -> string            // 业务主键拼接（\0 分隔），仅用于导入分类
validateRow(view, row) -> string[]            // 错误列表；空 = 合法
classifyImport(view, existingRows, incomingRows) ->
  { added: [{key,row}], updated: [{key,row,existing,diffs:[{field,label,from,to}]}], skipped: [{key,row,existing}], errors: [{key,row,errors}] }
applyImport(view, existingRows, classification, decisions) -> nextRows
  // decisions: { mode: 'merge'|'replace', addedKeys: string[], updatedChoices: { [key]: { [field]: boolean } } }
  // merge：追加勾选的新增行（补新 id）；更新行按逐字段勾选写回（按 id 定位）；
  // replace：全表 = 文件内有效行（新增 + 更新行均取文件版；同主键保留首条；已存在的主键复用原行 id，其余补新 id）。
paginate(rows, page, pageSize) -> { rows, total, from, to, totalPages, page }
formatPageRange(total, page, pageSize) -> string   // `共 N 条，显示 M–K 条`；空表 `共 0 条，显示 0–0 条`
filterRows(rows, columns, query) -> rows
sortRows(rows, sortKey, dir, columns) -> rows    // 稳定排序；number 列数值比，其余字符串比
countReferences(db, profile, view, rows) -> { projects: string[], rules: number, rowRefs: Map<id, {projects, rules}> }
  // 定额：工程 quantities 含该 code 的工程名 + rules 含该 quota 的条数；材料：rules 含 (material, spec) 的条数；其余 0。

// src/lib/undo.js
createUndoStack(limit=50) -> { push(snapshot,label), undo() -> {label,snapshot}|null, canUndo() -> bool, size() -> number, clear() }
// 快照约定（调用方构造，本模块不解释）：{ scope:'table', profileId, viewKey, rowsBefore } |
//   { scope:'profiles', profilesBefore, settingsBefore }

// src/components/LibraryTable.jsx
<LibraryTable view={view} rows={rows} referenceInfo={(rows)=>{projects,rules,rowRefs}}
  onEdit(id, patch) onAdd() onDelete(ids) onImport() onExport(format, scope) />
// scope: 'all' | 'filtered'；format: 'xlsx' | 'json'。删除确认由组件内 ConfirmDialog 完成后再调 onDelete。
// <ImportDiffPreview open viewLabel profileName classification onConfirm(decisions) onCancel />
// <ConfirmDialog open title impact samples confirmLabel onConfirm onCancel />

// electron/configIO.cjs（helpers = { exportProfile, importProfile }，由 main.cjs 传入 profiles.js 的函数）
exportProfileToFile(filePath, profile, helpers) -> { ok, filePath }
importProfileFromFile(filePath, helpers) -> profile   // 文件缺失 / JSON 非法 / 结构校验失败时抛 Error
exportConfigBackup(filePath, db) -> { ok, filePath }

// IPC（electron/main.cjs + preload.cjs，新增 5 个）
db:exportProfile    入参 {profileId, filePath}      出参 {ok, filePath} | {ok:false, error}
db:importProfile    入参 {filePath}                 出参 {ok, profile} | {ok:false, error}   // 名冲突 → 名 + '（导入）'
db:exportBackup     入参 {filePath}                 出参 {ok, filePath} | {ok:false, error}
excel:importLibrary  入参 {filePath, kind}           出参 {rows, errors}
excel:exportLibrary  入参 {filePath, kind, rows}     出参 true（.json 后缀时写 JSON 数组）
```

### 增量 4.4 关键决策（实现时按此执行，不逐项请示）

1. **导入解析与分类的分层**：`excel:importLibrary` 只做“解析 + 行级格式校验”（表头缺失 → 整文件 `errors`；行级必填/数值/枚举错误 → 该行进 `errors` 组），不做业务主键匹配；`classifyImport`（渲染进程纯函数）做业务主键匹配与四组分类。两层错误都进预览的错误组，禁止静默丢行。
2. **全部替换的备份**：替换模式确认后，调用方先压撤销快照，再以 `updateDb(fn, {major: true})` 落库（`major` 触发滚动备份，§4.3），缺一不可。批量删除同样以 `major: true` 落库（B2 删除前备份）。
3. **导出范围**：默认全部；搜索过滤激活时，导出按钮先 `confirm` 选择“全部 N 条 / 仅筛选 M 条”（非删除操作，`window.confirm` 可用，见 §增量 4.2 Settings 行）。导出内容 = 当前视图行（`rates` 视图导出展开后的费率行；`rules` 两视图各导各视图的切片）。
4. **行内编辑即时落库**：沿用 v1 模式（单元格 `onChange` 即 `updateDb`），不设“保存”按钮；新增行插到顶部并聚焦第一个单元格由浏览器原生行为近似（本增量不做聚焦管理，属体验细节）。
5. **删除确认的影响说明**：`countReferences` 实时算出（定额：引用工程名列表 + 规则条数；材料：规则条数）；对话框展示“其中 X 条被 Y 个工程引用，删除后这些工程的工程量行将显示孤儿警告”+ 前 5 条名称示例（§8.4）。删除定额不级联删工程量行，孤儿警告由引擎 `warnings` 在工作台展示（增量 5 接线；本增量只保证不级联删除）。
6. **费率页补齐（B8）**：费率视图行含增值税率四项（甲供/乙供/销项/安全生产费增值税率），数值列可改，改后写回 `rates.vatRates`；冬雨季行数值为空 = `null`（查表），输入 0 = 显式 0（与 §2.2.1 一致，UI 占位提示区分）。`setRate` 魔法下标不再出现。
7. **配置方案删除的引用检查**：`Profiles.jsx` 删除时先算引用工程；有引用 → 禁止删除，列出工程名 + “将这些工程切换到 [下拉]”一键切换入口（切换后可删）。`isBuiltIn` 的“默认配置”不设特殊保护（与增量 1 `importProfile` 的 `isBuiltIn=false` 一致；若删光方案导致 0 方案，`activeProfile` 回落逻辑要求至少 1 条——删除最后一个方案时禁止，提示“至少保留一个配置方案”）。

### 增量 4.5 影响面

- **旧功能**：`Settings.jsx` 重写为库管理壳，旧 4 个 Tab（材料/定额/费率/规则）被 11 视图 + 打折规则 Tab 替代；旧 `config` Tab 删除（功能移到 `Profiles.jsx`）。`App.jsx` 顶栏新增“配置方案”导航与“撤销”按钮。`calc.mjs` / `discount.mjs` / `printExport.cjs` / `excel.cjs` 的 `importQuantities` / `importQuotas` / `exportQuotas` 零改动（`importLibrary(kind='quotas')` 与 `importQuotas` 同表头，两者并存，旧调用方不动）。
- **旧测试**：现有 727 断言（引擎 12 + Excel 14 + 迁移 72 + savePatch 55 + discount 84 + print 490；crosscheck 跳过）不得改动、不许删除；新增 `tests/batch.test.mjs` 独立文件。
- **旧数据**：无迁移。旧 `db` 在增量 1 迁移时已补全部行 `id`；若用户数据中存在缺 `id` 的库行，`setViewRows` 在写回时补 `id`（读时不改数据）。
- **已知遗留（有意不做，归后续增量）**：① 工程删除（`Projects.jsx` / `Batch.jsx` 批量删工程）仍用旧 `confirm`、无撤销，属增量 5（工作台 + B2 全量收尾）。② `saveQueue` 节流（B3）属增量 5；本增量行内编辑仍每次 `updateDb` 即发 `savePatch`。③ 真机点按走查（库表分页/导入预览/撤销按钮/方案导入导出）归增量 5 自体验 QA；本增量验证为纯函数测试 + `npm run build`。④ `RATE_ITEMS` 兼容导出仍在 `calc.mjs`，Settings 已不再引用，删除属后续清理。

## 增量 5 架构补充（2026-10-14）

> 本节为增量 5（单工程工作台 + v1 QA 修复 B1/B2/B3 剩余项）的实施前架构说明，按 §1.2 追加，不改写上文历史章节。与上文不一致处以本节为准（已注明 supersedes）。

### 增量 5.1 数据模型（新增 / 改动的字段与 JSON 结构）

- **不新增持久化字段，不改 db 结构，不做数据迁移。** 本增量只读写增量 1 已落地的字段（`project.profileId` / `quantities[].id` / `rateOverrides` / `table5Overrides` / `warningsDismissed` / `profile.rates.vatRates` / `profile.table5Fees`）。工作台的全部 UI 状态（折叠、表二模式、搜索词、确认框、高亮行）均为组件本地 `useState`，不进 db、不进磁盘。
- **撤销快照新增两个 scope（内存态，不持久化，沿用增量 4 约定）**：
  - `{ scope: 'project', projectId, projectBefore }`：单个工程删除 / 工作台内删除孤儿行 / 切换配置方案前压入；`projectBefore` 为该工程的完整深拷贝。撤销 = 写回该工程（工程已不存在时重新插入到 `projects` 顶部；存在时原位替换）。
  - `{ scope: 'projects', projectsBefore }`：批量删除工程（Projects / Batch）前压入；`projectsBefore` 为 `projects` 数组的完整深拷贝。撤销 = 整数组写回。
  - 增量 4 已有的 `table` / `profiles` scope 不动。`App.jsx handleUndo` 按 scope 分发四种恢复路径；恢复一律经 `updateDb` + `saveQueue`，与正常保存同一链路。
- **工作台左区增值税覆盖**：读写 `project.rateOverrides.{jiaTax, yiTax, outputTax}`，`null` = 用配置值（界面占位提示显示配置值，如“配置值：0.13”；清空输入即写回 `null`，不写 0）。与 §2.3 一致：`info.甲供增值税` / `info.乙供增值税` 仍保留（v1 字段），优先级按 §2.4（`rateOverrides` > `info` > 配置方案）；工作台左区只暴露 `rateOverrides` 三项输入，不重复暴露 `info` 里的税率输入，避免两处值不一致。
- **表五手动项覆盖**：仅当 `profile.table5Fees` 中某项 `basis === 'manual'` 时，左区出现该项输入框，读写 `project.table5Overrides`（`{key, amount, enabled}`，`null` = 用配置）。无 manual 项时左区显示“当前配置无手动填项”，不渲染空输入框。
- **警告忽略**：工作台警告条的“忽略”写 `project.warningsDismissed`（追加警告 `code`，如 `orphanQty`）；警告条按 `warningsDismissed` 过滤已忽略的 code；行状态列的 `⚠` 标记**不**随忽略消失（§10 B7：忽略后警告条不再出现，但行状态列仍标 `⚠`）。
- **保存节流队列（内存态）**：`saveQueue` 只聚合待发送的补丁 `{patch, baseVersion, major}`，不持久化。`patch` 为分支级全量（`configurationProfiles` / `projects` / `settings` 三分支，见增量 1 `diffBranches`），合并规则 = 按分支 key 后写覆盖（later-wins-per-branch）；`baseVersion` 取队列首个补丁的版本（最早）；`major` 取 OR（任一补丁 `major` 则本次保存触发滚动备份，§4.3）。

### 增量 5.2 模块划分（改哪些文件、新哪些文件）

| 文件 | 动作 | 职责（本增量） |
|---|---|---|
| `src/lib/saveQueue.js` | 新 | 保存节流纯逻辑（无 React/Electron 依赖）：`createSaveQueue(saveFn, {delayMs: 800, setTimeoutFn, clearTimeoutFn, merge})`。`markDirty(value)` 聚合补丁并起/续 800ms 定时器；`flush()` 立即发送（清定时器；发送中再调则串联等待后重捞）；`pending()` 是否有待发送/发送中；`cancel()` 清定时器并丢弃待发送（仅用于卸载/测试）。定时器函数可注入，便于测试用假时钟。 |
| `src/lib/workbench.js` | 新 | 工作台纯函数（无 React/Electron 依赖，可单测）：`orphanWarning(warnings)` 取 `orphanQty` 警告；`invalidWarning(warnings)` 取 `invalidQty` 警告；`duplicateCodes(quotas)` 返回库中重复 `code` 集合；`rowStatus(row, {orphanIds, invalidIds, dupCodes})` → `'' \| 'orphan' \| 'invalid' \| 'duplicate'`（优先级：孤儿 > 无效 > 重复）；`orphanRowIds(warnings)`；`deleteOrphanRows(project, orphanIds)` 返回新 `quantities`（不改原对象）；`dismissWarningCode(project, code)` 返回新 `warningsDismissed` 数组；`restoreProjectSnapshot(draft, snapshot)` 恢复 `project` / `projects` scope 快照（就地改 draft，返回 bool）。 |
| `src/lib/undo.js` | 不动 | 快照约定新增 `project` / `projects` scope（见 §增量 5.1），栈本身无改动。 |
| `src/pages/Workbench.jsx` | 新 | 单工程工作台（§9.1）：顶栏 + 左/中/右三区，不分页签。props：`{db, project, updateDb, back, pushUndo, notify, flushSaves}`。全部数值来自同一次 `calcFor`（`useMemo [db, project]`，try/catch：重算异常时右区显示错误态，不显示旧数值）。导出前 `await flushSaves()` 再调 `excel:exportBudgetBook`；孤儿行 >0 时导出前弹确认。 |
| `src/pages/ProjectDetail.jsx` | 删 | 由 `Workbench.jsx` 替代（§9.2）。删除前确认引用：仅 `App.jsx` 引用（grep 验证）；`calc.mjs` 注释中“旧调用方（excel.cjs / ProjectDetail）”字样随 `calc.mjs` 注释更新一并修正为 Workbench（仅注释，不改逻辑）。 |
| `src/App.jsx` | 改 | `ProjectDetail` → `Workbench`；持有 `saveQueue`（`useRef(createSaveQueue(saveFn, {delayMs: 800}))`）；`updateDb(fn, opts)` 不再每次即发 `savePatch`，改为算补丁 → 乐观更新本地状态 → `saveQueue.markDirty({patch, baseVersion, major})`；新增 `flushSaves()` 下发给 Workbench；`beforeunload` 监听：有待保存时阻止默认退出并 `flush()`；`handleUndo` 新增 `project` / `projects` scope（调 `restoreProjectSnapshot`）；`Projects` / `Batch` / `Workbench` 新增 `pushUndo` / `notify` / `flushSaves` props。 |
| `src/pages/Projects.jsx` | 改 | 单工程删除：`window.confirm` → `ConfirmDialog`（含工程名 + 工程量行数影响说明）+ 压 `projects` scope 撤销快照 + `updateDb(..., {major: true})`（删除前备份，B2）+ Toast 带撤销；新增“删除选中”批量删除（复选框已有），同款确认 + 撤销 + `major`；导出成功 `alert` → `notify` Toast（B1 导出本身不动，仍走 `saveFile` + `exportBudgetBook` 真实路径）。其余 `alert`（阻塞性校验，如“请先勾选”）保留。 |
| `src/pages/Batch.jsx` | 改 | 新增“批量删除选中工程”（⑤ 区，确认 + 撤销 + `major`，与 Projects 同款）；`batchDiscount` 补齐 §2.3：改折扣时同时写 `rateOverrides.discount` 并同步 `info.施工折扣`（此前只写 `info`，与 §2.3“写入时同步”不符，属本增量内顺手修正）；其余不动。 |
| `src/engine/calc.mjs` | 改（仅注释） | 注释“旧调用方（excel.cjs / ProjectDetail）”→“旧调用方（excel.cjs / Workbench）”。零逻辑改动。 |
| `src/styles.css` | 改 | 新增工作台样式：`.workbench` 三区 grid、`.wb-left.collapsed`、`.wb-warn` 警告条、`.wb-row-hl` 行高亮、`.wb-collapse` 折叠区标题、`.wb-compare` 对照表。沿用现有视觉风格，不改旧样式。 |
| `tests/workbench.test.mjs` | 新 | 工作台测试（§12.1 增量 5 部分）：saveQueue 节流行为、工程删除撤销恢复、孤儿行 helpers、录入联动计算（改数量/切方案重算）、导出前 flush 契约。 |
| `package.json` | 改 | `test` 脚本追加 `tests/workbench.test.mjs`。 |
| `electron/*` | 不动 | B1 核查结论：全部导出已走主进程 fs 写真实路径（见 §增量 5.4），主进程零改动。 |

### 增量 5.3 接口（函数签名）

```js
// src/lib/saveQueue.js
createSaveQueue(saveFn, opts) -> { markDirty(value), flush() -> Promise<void>, pending() -> bool, cancel() }
//   saveFn(pending) -> Promise<void>，pending = { patch, baseVersion, major }；
//   opts.delayMs 默认 800；opts.setTimeoutFn / opts.clearTimeoutFn 默认全局定时器（测试注入假时钟）；
//   opts.merge(acc, value) 默认：分支 key 后写覆盖 + baseVersion 取首个 + major 取 OR。
//   flush() 语义：清定时器，取走当前待发送桶，调 saveFn；发送期间新 markDirty 进下一桶，
//   本次 flush 循环继续发送下一桶，直到桶空（显式 flush 后 pending() === false，除非发送中又有新 markDirty）。

// src/lib/workbench.js
orphanWarning(warnings) -> warning | undefined        // code === 'orphanQty'
invalidWarning(warnings) -> warning | undefined       // code === 'invalidQty'
orphanRowIds(warnings) -> string[]                    // orphanQty.rowIds ?? []
duplicateCodes(quotas) -> Set<string>                 // 库中出现 ≥2 次的 code
rowStatus(row, { orphanIds: Set, invalidIds: Set, dupCodes: Set }) -> '' | 'orphan' | 'invalid' | 'duplicate'
deleteOrphanRows(project, orphanIds) -> quantities[]  // 新数组，不改原 project
dismissWarningCode(project, code) -> string[]        // 新 warningsDismissed（去重）
restoreProjectSnapshot(draft, snapshot) -> boolean    // scope 'project' | 'projects' 时恢复并返回 true，否则 false

// Workbench props
<Workbench db project updateDb back pushUndo notify flushSaves />
//   flushSaves: () -> Promise<void>，导出/切换工程前调，等待队列排空后再读磁盘/导出。

// App.jsx 新增
const flushSaves = () => saveQueueRef.current.flush();
// handleUndo 新增分支：snap.scope === 'project' || 'projects' → updateDb((d) => restoreProjectSnapshot(d, snap))
```

### 增量 5.4 关键决策（实现时按此执行，不逐项请示）

1. **工作台三区内容不丢功能（§9.2 对照）**：费用表 → 右区（表二折前/折后/对照 + 表一 + 表五 + 汇总紧凑表）；材料表（含材料调整/单价覆盖/备选勾选）→ 右区折叠区（默认折叠）；表三甲/乙/丙 → 右区折叠区（默认折叠）；工程信息 → 左区；工程量 → 中区。v1 `ProjectDetail.jsx` 的 `FeeTable` / `MatTable` 展示列原样搬运，不增删列。
2. **表二对照模式**：`[折后 | 折前 | 对照]` 三态；对照 = 两列并排（折前 | 折后），行取 `table2Before` / `table2After` 的同 key 集合（左栏费用项，见 §5.2 表二结构；两版均含的 key 全量展示）。
3. **配置方案切换**：下拉选新方案 → `ConfirmDialog`（“切换配置将重新计算，结果可能变化”+ 旧方案名 → 新方案名）→ 确认后压 `project` scope 快照（`projectBefore` = 切换前工程）→ 写 `profileId`。取消则下拉值回落（受控组件，`value={project.profileId}`，不设本地 state）。
4. **工程删除确认与撤销（B2 收尾）**：单删 / 批量删工程一律 `ConfirmDialog` + 快照 + `major` 备份 + Toast 带“撤销”按钮（5 秒，复用增量 4 `notify({undo: true})`）。工作台内删单条工程量行：`ConfirmDialog`（显示定额编号 + 项目名称 + 数量）+ `project` scope 快照；删孤儿行：`ConfirmDialog`（显示孤儿行数 + 编号列表）+ 同款快照。`window.confirm` 在删除路径上清零；仅剩 `LibraryTable.jsx` 的“导出全部还是仅筛选”非删除选择（增量 4 已裁决保留）。
5. **saveQueue 与冲突（B3）**：`saveFn`（App 内）= 发 `db:savePatch({patch, baseVersion, major})`；成功 → 更新 `meta.saveVersion`；冲突 → 重拉 `getDb` → `patch2 = diffBranches(fresh, dbRef.current)`（本地状态已含全部编辑，等价重放）→ 以 fresh 的 `baseVersion` 再发一次；`patch2` 为空则直接 `setDb(fresh)`；再失败 → 重拉覆盖本地。发送期间的新编辑进下一桶，不丢失。
6. **本地深拷贝保留（supersedes §10 B3 的“不深拷贝整库”一半要求，需说明）**：`updateDb` 仍对 `prev` 做一次 `JSON.parse(JSON.stringify(prev))` 再执行 `fn`。原因：`updateDb(fn)` 的调用约定是“`fn` 就地改 draft”，调用方遍布各页（数量/信息/库表/方案），不改调用约定就无法定位被改分支做结构共享；逐个调用点改不可变更新属重构级改动，不在本增量。B3 的真实磁盘成本（每次按键全文件写 + 备份复制）已由 saveQueue（800ms 节流，连续输入最多每 800ms 写一次盘）+ 主进程备份节流（§4.3，≥1 小时或 `major` 才备份）消除；本地内存深拷贝一次约毫秒级，不再是瓶颈。本条作为已知限制记入变更记录，不视为 B3 未完成。
7. **B1 全量核查（本增量执行，不新增代码）**：`grep -rn "Blob|createObjectURL|download=|<a "` 结果为空；全部导出点逐个核查：预算书（Projects / Batch / Workbench）→ `saveFile` + `excel:exportBudgetBook`；库导出（Settings/LibraryTable）→ `saveFile` + `excel:exportLibrary`（`.json` 后缀时主进程 `fs.writeFile`）；配置方案导出（Profiles）→ `saveFile` + `db:exportProfile`；整库备份（Profiles）→ `saveFile` + `db:exportBackup`；主进程侧全部 `fs.writeFile` / `wb.xlsx.writeFile` 写传入的真实 `filePath`。无一处用浏览器下载冒充。核查命令与结果记入变更记录。
8. **工作台内孤儿警告展示（B7 接线）**：中区顶部警告条取 `result.warnings` 的 `orphanQty`（“有 M 行工程量引用了库中不存在的定额编号，将不参与计算”+ 编号列表 + `[定位]` `[删除孤儿行]` `[忽略]`）；行状态列按 `rowStatus` 标 `⚠ 未建档` / `⚠ 数量无效` / `⚠ 编号重复`；`[定位]` 滚动到首个孤儿行并高亮 2 秒；底部“共 N 行，其中孤儿 M 行”。导出前孤儿确认：`ConfirmDialog`（孤儿行数 + 编号）→ 确认后导出，导出本身按 §11 原样呈现孤儿行（定额编号列写 `不取费`、工日列为空）——导出渲染已在增量 3 落地，本增量只接确认弹窗。
9. **行内编辑与保存**：数量/系数/左区输入的 `onChange` 仍每次调 `updateDb`（本地状态立即更新，界面实时联动），但 `savePatch` 由 saveQueue 节流，连续打字不再每次写盘。`flushSaves` 调用点：导出预算书前、切换工程前（`back` / `openProject` 不在本增量改，导出前 flush 已覆盖 §9.1 要求；`beforeunload` 兜底）。
10. **真机点按走查**：增量 4 遗留的库表分页/导入预览/撤销按钮/方案导入导出 + 本增量工作台三区/删除撤销/节流保存，归本增量自体验 QA；受限于本环境无 Electron 真机验证，走查以 `npm run build` + 纯函数测试 + 代码级核查（B1 grep）为准，并在变更记录中如实注明未做真机点按走查（同增量 1–4 口径）。

### 增量 5.5 影响面

- **旧功能**：`ProjectDetail.jsx` 删除，`App.jsx` 路由 `detail` 改渲染 `Workbench`；`Projects.jsx` / `Batch.jsx` 删除流程与导出提示改动；`updateDb` 保存链路改节流（全部调用方自动受益，无需改调用点）。`Settings.jsx` / `Profiles.jsx` / `LibraryTable.jsx` / 引擎 / 打印导出零改动。
- **旧测试**：现有 883 断言（引擎 12 + Excel 14 + 迁移 72 + savePatch 55 + discount 84 + print 490 + batch 156；crosscheck 跳过）不得改动、不许删除；新增 `tests/workbench.test.mjs` 独立文件。
- **旧数据**：无迁移。撤销快照与 saveQueue 均为内存态，重启即空；`warningsDismissed` 为增量 1 已落地字段，本增量首次写入。
- **已知遗留（有意不做，归后续增量）**：① `updateDb` 本地整库深拷贝保留（见 §增量 5.4 决策 6）。② 真机点按走查未做（见决策 10）。③ `RATE_ITEMS` 兼容导出仍在 `calc.mjs`（增量 4 遗留）。④ crosscheck 真实 LO 夹具仍缺失（附录 B Q8，归增量 6）。

## 增量 6 架构补充（2026-10-14）

> 本节为增量 6（测试与验收 + 自体验 QA 并修完问题，最后一增量）的实施前架构说明，按 §1.2 追加，不改写上文历史章节。与上文不一致处以本节为准（已注明 supersedes）。
> Q2（11 项措施打折默认）仍待主代理裁决，本增量不重新决策：按当前默认（§6.2，11 项打折）验收；17377.17 差额断言保留（见 §增量 6.4），报告中明确标注 Q2 待裁决及其对验收数字的影响。

### 增量 6.1 数据模型（新增 / 改动的字段与 JSON 结构）

- **不新增持久化字段，不改 db 结构，不做数据迁移。** 本增量不改引擎、导出、UI 的业务逻辑（除自体验 QA 发现的小修，见 §增量 6.3）；只补测试验收层：夹具文件 + 测试接线 + 验证脚本。
- 新增仓库内文件（见 §增量 6.2）：`tests/fixtures/lo_values.json`（LO 真实重算值，扁平 `表!单元格 → 数值`，与旧 `/tmp/bt/lo_values.json` 同形状）与 `tests/fixtures/lo_values.meta.json`（来源与复现信息，不含任何数值断言）。`crosscheck.test.mjs` 只改夹具读取路径与跳过逻辑，29 项断言（含增量 2 的三处新口径换算）**一字不改**，防止“为通过而改断言”。

### 增量 6.2 夹具重建方案（附录 B Q8，核心交付）

- **来源**：`~/workspace/your_files/预算模板/通信概预算自动化母版_v3.0.xlsx`（SHA256 `ff5ed39f…4486d4`，与 MEMORY 中 v3.0 记录一致；重建脚本运行时重新计算 SHA 并写入 meta，SHA 不一致即拒绝生成）。
- **场景**：与 `tests/crosscheck.test.mjs` 的 7 行工程量逐项一致（TXL1-002 测量 10、TXL3-187 挂钩 6 芯 2 / 24 芯 3、TXL4-053 工日X0.5 数量 4 系数 0.5、TXL7-023 二槽位 5 / 48 芯 1、TXL7-043 落地式 288 芯 2；`info`：线路工程、折扣 1、实际里程 36、冬雨季 Ⅲ类、甲供增值税 0.13、乙供增值税 0.09）。场景定义只在重建脚本与测试两处出现，两处逐项对齐由本增量人工核对 + 测试通过背书（场景不一致 → 断言失败，不会静默通过）。
- **重算流程**（脚本 `scripts/rebuild_crosscheck_fixture.py`，改编自 `~/workspace/build_budget_template/crosscheck.py`，逻辑逐行对齐，见脚本头注释的差异清单）：
  1. 复制母版到 `/tmp/bt-inc6/xcheck.xlsx`（不在仓库内写中间文件，避免污染）；
  2. `工程量` 表 B1=1、按 `(code, variant)` 匹配填 E 列（工程 1）数量；`综合信息` B13=线路工程、B16=1（折扣）、B27=36（里程）；
  3. `soffice --headless --calc --convert-to xlsx --outdir /tmp/bt-inc6/out` 重算；
  4. `openpyxl.load_workbook(data_only=True)` 读回 §增量 6.2 提取键表的 29 个单元格（含测试未直接用的 `表二!D19`，保留为完整性证据），写 `tests/fixtures/lo_values.json`（扁平 dict，`json.dumps(ensure_ascii=False, sort_keys=True)`，数值原样，不四舍五入、不手改）。
- **母版 bug 的两处绕行（不是手编数值，值仍由 LO 公式算出）**：① 母版 `费率` 表 G17:K17 冬雨季嵌套 `TEXT(HLOOKUP)` 在 LO 下算出 `#N/A` → 按母版本意（Ⅲ类地区 → 0.018）写成 plain 数 0.018（与 `crosscheck.py` 一致）；② 母版表五 H11 `=(J1365+J1366+J1367)/10`，空量行 J 为 `""` 空串，LO 下 `""+10` 会 `#VALUE!` → 把另两行 J1365/J1367 置 0（与 `crosscheck.py` 一致）。两处绕行写入 meta 的 `workarounds`，并在变更记录中明示。
- **测试内保留的一处换算（不是夹具手编）**：LO 算出的 `表二!I8` 原为 `#N/A`（同 ①），测试按母版本意换算为 `ROUND(laborTotal×0.018, 2)`（`loFixed`，见 `crosscheck.test.mjs` 注释）；费率绕行（0.018 plain 数）后 LO 实际真算出该值（156.96），与换算值一致，互为印证。`表二!I14`（调遣费）测试沿用硬编码 1410（母版调遣单价 141 × 10 人，与 `crosscheck.py` 注释一致；LO 的 I14 为公式值但测试未取用，不纳入夹具提取键）。
- **防手编机制**：夹具文件头由脚本写 `_generated` 标记？否——扁平 dict 不掺标记。防手编靠三点：① 重建脚本进仓库，任何人重跑脚本必须得到逐项相同的值（`sort_keys` 确定性输出；LO 版本记入 meta，版本不同时需注明）；② `lo_values.meta.json` 含母版 SHA + LO 版本 + 生成时间 + 生成命令；③ 本增量变更记录给出重跑命令与通过数。
- **提取键表**（29 键；测试 29 项断言中 27 项直接取夹具值，`表二!I8` 走 `loFixed` 换算、`表二!I14` 硬编码 1410，`表二!D19` 为完整性保留）：`表三甲!H66/I66/H68/I68`、`表三乙!J52`、`表三丙!J57`、`表四甲（主材）!I63/J63`、`表四乙(乙供）!I63`、`表二!D9/D13/D16/D17/D18/D19/I16/I23/I24/D6/D5`、`表一!G6/G7/J9/L9/L12`、`表五!D23/E23`、`汇总表!L11`、`表二!I8`（LO 绕行后真算出值，测试换算，两者应一致）。

### 增量 6.3 模块划分（改哪些文件、新哪些文件）

| 文件 | 动作 | 职责（本增量） |
|---|---|---|
| `scripts/rebuild_crosscheck_fixture.py` | 新 | 夹具重建脚本（见 §增量 6.2；只读母版、只写 `/tmp/bt-inc6/*` 中间文件与 `tests/fixtures/lo_values*.json`）。 |
| `tests/fixtures/lo_values.json` | 新 | LO 真实重算夹具（脚本生成，勿手改）。 |
| `tests/fixtures/lo_values.meta.json` | 新 | 夹具来源元数据（脚本生成：母版路径+SHA、LO 版本、生成时间、生成命令、场景摘要、workarounds）。 |
| `tests/crosscheck.test.mjs` | 改（仅接线） | 删跳过分支（`existsSync('/tmp/bt/lo_values.json')` → `process.exit(0)`），改为读仓库内 `tests/fixtures/lo_values.json`（`new URL('./fixtures/lo_values.json', import.meta.url)`）；缺失夹具时**抛错失败**，不许再跳过。29 项断言、容差、增量 2 换算一字不改。 |
| `docs/v2-design.md` | 改（本文档） | 新增本节（架构补充）+ 附录 C 追加增量 6 变更记录。 |
| 自体验 QA 修复文件 | 待定（小修） | QA 发现的问题在本增量内修完（小修）；若发现需大改的问题，修完并在变更记录中说明，不许瞒报。修复必须配回归测试（新增断言或沿用现有断言），不许只改代码不补测试。 |

### 增量 6.4 验收方案（§12 落地清单，按序执行，全部通过才为发布候选）

1. **夹具重建**：跑 `python3 scripts/rebuild_crosscheck_fixture.py`，产出夹具 + meta；重跑一次，`diff` 两次输出逐项相同（确定性）。
2. **全量测试**：`npm test`（9 个文件：引擎 12 + crosscheck 29 + Excel 14 + 迁移 72 + savePatch 55 + discount 84 + print 490 + batch 156 + workbench 46 = 958 预期；crosscheck 不再跳过）。任一失败即修，修完重跑全量，不许只跑单文件。
3. **`npm run build`** 通过；`node --check` 覆盖本增量改动的 JS/CJS 文件。
4. **导出回读（LibreOffice 往返）**：`node scripts/verify-print-export.mjs`（导出夹具 + 合成工程 → LO headless 转换 → ExcelJS 读回逐项比对），记录非空单元格数与不一致数；不一致必须为 0（LO richText 分段表示差异需展平后比对，见增量 3 经验）。
5. **结算书对数（§12.3）**：`tests/print.test.mjs` 的参考夹具对数已覆盖版式 + 数值（除 Q2/Q5/规费子项/表五方法列/销项税额五处已知差异外）；本增量再人工复核一遍对数表（见 §增量 6.5），把“自动化通过 + 人工复核”双证据记入变更记录。
6. **自体验 QA 清单（代码级 + 导出回读 + 结算书对数，按 v2 需求逐项验收）**：
   - 11 张表打印版式（§5.1–§5.4）：表名/顺序、列宽/合并区、表尾固定行、页码单元格文本、数值型单元格、表二双表版式一致、表三甲分页、表四甲三组小计+总计、表五生产准备行在总计之后。
   - 10 个库管理 + 批量操作（§8）：11 视图（`rules` 拆两视图）搜索/分页/复选/批量删除/导入差异预览（新增/更新/跳过/错误四组）/导出/撤销。
   - 多套配置 + 迁移（§2/§4）：方案新建/复制/重命名/删除（引用检查）/导出/导入往返、默认配置迁移、v1 备份。
   - 单工程工作台（§9）：三区布局、折后/折前/对照三态、孤儿警告条 + 定位 + 删孤儿行 + 忽略、增值税覆盖、表五手动项覆盖、配置切换确认、导出前 flush + 孤儿确认。
   - 打折双表二（§6）：逐项打折、合计由明细加总、方法列模板；**Q2 待裁决标注**：当前默认下完整参考折前表算得折后措施 27436.31、折后除税价 282644.82，与参考折后表 10059.14 / 265267.65 相差 **17377.17**（= 11 项逐项打折后之和；参考折后表该 11 项全部为空）；`tests/discount.test.mjs` 已将该差额作为可复现断言锁定，非测试失败。本增量不重新决策。
   - 安全生产费口径（§7.1）：2% + VAT 0、基数折前建安除税价、表五甲方法列 `折前建安工程费除税价X2%`。
   - 汇总表口径（§7.2）：建安费 = 表一折后建安费（含主材）、其他费用 = 表五总计、无自购物资行、无 `×0.4`。
   - B1–B9 修复：B1（Blob 清零、全部导出走主进程 fs 真实路径）、B2（删除确认 + 撤销，删除路径 `window.confirm` 清零）、B3（saveQueue 800ms 节流、备份节流）、B4（分页文案 `共 N 条，显示 M–K 条`）、B5/B6（口径，见上）、B7（孤儿警告 + 按 `id` 删除）、B8（费率具名字段、`rateGrid[` 下标清零、增值税率四项可见可改）、B9（加载失败错误态 + 重试）。
   - 排除项（§11）：定额库中 7 条无编号行 `grep` 为 0；导入含 7 条的文件时预览归类正确。
   - 真机点按走查：本环境无 Electron 真机验证，同增量 1–5 口径，以 `npm run build` + 纯函数测试 + 代码级核查为准，并在变更记录中如实注明未做真机点按走查；**不搭临时旁路（如内网穿透）绕过走查**（§1.5）。
7. **发布候选证据清单**：各增量变更 + 总测试数 + 验收结论（见 §增量 6.6），交主代理核验后发布；本增量不 push、不打 tag、不触发构建、不动 Release、不 git commit。

### 增量 6.5 结算书对数人工复核（§12.3 对数表，本增量执行）

- 复核方式：以 `tests/fixtures/reference-book.json`（增量 3 由 `scripts/build_reference_fixture.py` 从 raw.json 机械提取）为输入，用 `printExport.exportBudgetBook` 导出 → ExcelJS 读回 → 与 §12.3 对数表逐项比对；同时用 LibreOffice 打开参考结算书原 `.xls` 转换件与导出件，肉眼抽查标题、表尾、页码、分组头。
- 已知差异（不是 bug，验收时不计入失败，见 §12.3 + 增量 2/3 遗留）：① Q2：11 项折后差额 17377.17（见 §增量 6.4）；② 折后规费子项值（模型：子项 = 折前值；参考：子项 = 打折后值；合计均为还原值，差 0.01 舍入）；③ 折后销项税额 Q5（参考为空/0，v2 按折后基数公式算出并展示）；④ 表五安全生产费方法列（参考写数值 `10250.19`，v2 写方法表达式）；⑤ 数值型 vs 文本型（参考转换后为文本型，v2 为数值型）；⑥ 方法列 `%` 全角 vs ASCII。

### 增量 6.6 影响面

- **旧功能**：本增量不改业务逻辑；QA 小修如触及业务逻辑，必须按 §1.2 补架构说明（在本节追加“QA 修复”条目）+ 配回归测试 + 在变更记录中说明。
- **旧测试**：`crosscheck` 由跳过改为真实跑通；其余 8 个测试文件不改断言（QA 修复如需改断言，必须在变更记录中逐条列出改写理由，不许悄悄删除断言）。
- **旧数据**：无迁移。夹具文件进仓库后，CI 上 `npm test` 不再因缺失夹具而跳过 crosscheck。
- **已知限制（有意不做）**：① 真机点按走查未做（见 §增量 6.4 第 6 条末尾）。② `updateDb` 本地整库深拷贝保留（增量 5 决策 6）。③ `RATE_ITEMS` 兼容导出仍在 `calc.mjs`（增量 4 遗留）。④ Q1/Q3–Q7 未决（附录 B），本增量不重新决策；Q2 明确标注待裁决。

### 增量 6.7 QA 修复（自体验 QA 中发现，本增量内修完）

**修复 1：crosscheck 表一三处断言补安全生产费换算（测试-only，引擎不动）。**
- 现象：真实 LO 夹具首次跑通时 `29 项中断言 26 通过 / 3 失败`，失败全在表一合计：J9 引擎 23217.1 vs LO 23117.89、L9/L12 引擎 25181.56 vs LO 25109.14。
- 真因：表一合计含表五总计，安全生产费口径变化（1.5%+9% → 2%+0）同样影响表一。增量 2 换算断言时只改了表五两处断言与表一的 `taxAfter` 部分（+甲供增值税），漏了表一三处断言的安全生产费分量。增量 2 用合成夹具验证时该遗漏被掩盖（合成夹具的表一值按引擎值编造，与真实 LO 值不符——正是“54 通过不可复现”的根源之一）。
- 验证：LO 旧口径自洽（`D6+D23 = J9 = 23117.89`；`J9+I24+E23 = L9 = 25109.14`）；引擎新口径值 = LO 值 + `D6×0.005`（除税差额 99.21）− `D6×0.015×0.09`（旧安全生产费增值税 26.79），逐项吻合。修复后 `node tests/crosscheck.test.mjs` → `29 通过 / 0 失败`。
- 修正内容（`tests/crosscheck.test.mjs`，仅期望值表达式 + 注释）：J9 期望值 += `D6×0.005`；L9/L12 期望值 += `D6×0.005 − D6×0.015×0.09`（保留原有 +甲供增值税项）。断言条数、容差、其余 26 项断言一字不改。Supersedes §增量 6.1 “29 项断言一字不改”的表述（其余 26 项一字不改，表一 3 项按新口径补换算）。
- 教训：夹具必须来自真实重算；合成夹具只能验证自洽，不能验证口径换算是否漏项。

## 附录 C：变更记录（按 §1.3，实施阶段追加）

### 增量 1（2026-10-14，实施者：子代理）
- 改了什么：
  - 架构：`docs/v2-design.md` 新增“增量 1 架构补充（2026-10-14）”一节（数据模型 / 模块划分 / 接口 / 影响面 / 验证），追加、不改写历史。
  - 新文件：`src/engine/rates.mjs`（费率模型纯函数）、`src/lib/profiles.js`（方案管理纯函数：迁移 / 自检 / 补丁 / 导出导入 / resolveRates）、`electron/dbStore.cjs`（原子写 + 备份/回滚 IO）、`tests/migration.test.mjs`、`tests/savepatch.test.mjs`。
  - 改：`electron/main.cjs`（v2 加载 + 迁移 + `db:savePatch`/`db:reload`/`app:getVersion` + 原子写 + 备份节流）、`electron/preload.cjs`（暴露上述通道）、`src/lib/store.js`（`calcLibs` 按 `profileId` 解析方案、`newProject` 补 `profileId`/行 `id`/`table5Overrides`/`warningsDismissed`）、`src/App.jsx`（`updateDb` 改分支级补丁 + `savePatch` + 冲突重拉重试；`getDb` 错误态 + 重试）、`src/pages/Settings.jsx`（读/写激活方案库、定额改/删按 `id`、费率具名字段读写 + 增值税率四项可见可改）、`src/pages/Projects.jsx`（配置方案列 + 按方案筛选）、`src/pages/Batch.jsx`（`getLibraries` 接线、导入行补 `id`）、`src/pages/ProjectDetail.jsx`（`getLibraries` 接线、工程量改/删按 `id`、新增行补 `id`）、`package.json`（`test` 追加两个新测试）。
  - 不动：`src/engine/calc.mjs`（引擎口径零改动）、`electron/excel.cjs`（打印导出属增量 3）。`Settings` 的 Blob 导出（B1）、`saveQueue` 节流（B3 完整修复）、`Profiles.jsx` 配置方案管理页（增量 4）、工作台（增量 5）均未动，见“已知遗留”。
- 为什么：对应 §2（数据模型）、§4（迁移）、§3.3（`db:savePatch`）、§10 B7（按 `id` 定位）、B8（费率具名字段，Settings 侧先行）。
- 验证证据：
  - `npm test`：引擎 12 通过 / 0 失败；crosscheck 跳过（`/tmp/bt/lo_values.json` 不存在，已知情况，附录 B Q8）；Excel 13 通过 / 0 失败；新增迁移测试 72 通过 / 0 失败；新增 savePatch 测试 55 通过 / 0 失败。合计 12+13+72+55=152 断言通过。
  - 迁移计算对照（`tests/migration.test.mjs` 输出）：同一工程 v1 libs vs `profileToLibs`：`table2.exclTax` 11323.98 = 11323.98；`techDays` 9.775 = 9.775；`table4A.totalExcl` 5035 = 5035（容差 0.011，全量相等）。
  - `npm run build` 通过（35 modules transformed）。
  - `node --check electron/main.cjs electron/preload.cjs electron/dbStore.cjs` 通过；CJS 动态 `import('../src/lib/profiles.js')` 验证通过（`migrateV1ToV2` / `applySavePatch` 均为 function）。
  - `grep -rn "db\.libraries" src/` 仅剩兼容分支（`store.js` v1 分支、`profiles.js` v1 分支、`Settings.jsx` 回落分支）与注释；`grep -rn "rateGrid\[" src/` 仅剩 `calc.mjs` v1 引擎一行（增量 2 删除）。
- 已知遗留：
  - `profile.rates.byProjectType[type].winterRate` 非 null 覆盖值已存但 v1 引擎不消费（仍查 `winterTable`）；增量 2 引擎切换后才生效。迁移时该字段恒为 null，行为无变化。
  - 渲染进程 `updateDb` 仍做整库深拷贝 + 分支 JSON 对比；B3 的 `saveQueue` 节流与无深拷贝属增量 5。
  - `Settings` 配置导入导出仍走旧 Blob 方式（B1 属增量 5）；配置方案管理页 `Profiles.jsx` 属增量 4。
  - 设计文档口径澄清（本增量已按表格/代码落实，增量 2 复核时请确认）：§7.3 正文称“表五 14 项”，但同节表格实际列出 16 行（含 `designTotal` 合计行）；本增量 `DEFAULT_TABLE5_FEES` 为 16 条，以表格为准。§7.3 basis 枚举未列 `sum`，本增量为 `designTotal` 行补充 `basis='sum'`（见增量 1 架构补充）。
  - 未做真机点按走查（本增量无 Electron 真机验证环境；`db:savePatch` 的主进程路径已由纯函数测试覆盖，IPC 接线需在后续增量自体验 QA 中点按验证）。

```
### 增量 2（2026-10-14，实施者：子代理）
- 改了什么：
  - 架构：`docs/v2-design.md` 新增“增量 2 架构补充（2026-10-14）”一节（数据模型 / 模块划分 / 接口 / 与参考结算书对照 / 影响面），追加、不改写历史。
  - 新文件：`src/engine/discount.mjs`（打折模型纯函数 `applyDiscount`、`DISCOUNT_LINE_DEFS`、`DEFAULT_NO_DISCOUNT_KEYS`、`renderMethodText`，不依赖 calc）、`tests/discount.test.mjs`（84 断言）。
  - 改：`src/engine/calc.mjs`（口径重写：删除 v1 表一折扣快捷公式 / 安全生产费 1.5%+9% 公式 / 汇总表 `×0.4`+自购物资公式；删除 `rateFor`/`winterRateFor` 与 `DISPATCH_*` 硬编码常量；`RATE_ITEMS` 改为由 `RATE_FIELD_DEFS` 派生并保留兼容导出；新增 `table2Before`/`table2After`、`table5.rows`、`warnings[]` 孤儿/无效/重复警告；费率具名读取，`winterRate` 非 null 覆盖值生效；表五按 `table5Fees` + `table5Overrides` 逐项取费）；`src/lib/profiles.js`（`DEFAULT_NO_DISCOUNT_KEYS` 改为从 `discount.mjs` 导入重导出，单一来源；注释更新）；`src/lib/store.js`（注释更新：引擎不再读 `rateGrid` 垫片）；`electron/excel.cjs` + `src/pages/ProjectDetail.jsx`（汇总表删除“自购物资”行，与 §7.2 一致）；`tests/crosscheck.test.mjs`（表一含税 / 表五 / 汇总表三处断言按新口径换算期望值，其余不动）；`package.json`（`test` 追加 `tests/discount.test.mjs`）。
  - 不动：`tests/engine.test.mjs` / `tests/excel.test.mjs` / `tests/migration.test.mjs` / `tests/savepatch.test.mjs`（经核查均无断言旧错误公式；旧口径断言实际全部位于 `crosscheck` 与已被删除的 v1 公式本身）。`validate.mjs` 未建（警告在 `calc.mjs` 内联实现，独立校验模块随增量 4/5 再抽取）。
- 为什么：对应 §6（打折模型）、§7（安全生产费 2%+VAT 0、汇总表口径、表五可配置）、§3.1（引擎接口）、§10 B7（孤儿警告）、B8（费率具名字段，引擎侧落地）；Q2/Q5 按任务指令与文档默认值执行（Q2：11 项默认打折；Q5：折后销项税额按折后基数公式）。
- 验证证据：
  - `npm test`：引擎 12 通过 / 0 失败；crosscheck 跳过（`/tmp/bt/lo_values.json` 不存在，已知情况，附录 B Q8）；Excel 13 通过 / 0 失败；迁移 72 通过 / 0 失败；savePatch 55 通过 / 0 失败；新增 discount 84 通过 / 0 失败。合计 12+13+72+55+84=236 断言通过。
  - `npm run build` 通过（vite build，220.12 kB JS）。
  - 参考样本逐项打折（`tests/discount.test.mjs`，折前表取自参考结算书表二折前表实测值）：技工 54836.58、普工 18279.41、机械 2114.82、仪表 5857.54、文明 2893.77（不打折）、点交 2412.83、车辆 3655.80、工具 1096.74、企管 20033.78、利润 14623.20、主材/辅材不打折、规费合计 64994.13（参考 64994.14，差 0.01 为 §6.5 预期舍入，容差 0.02 覆盖）。
  - v1 快捷公式证伪：`(512509.64−74246.30−64994.13)×0.379+74246.30+64994.13 = 280709.46`，与参考折后 265267.65 相差 15441.81（已删除）。
  - 安全生产费：`10250.19 = 512509.64 × 2%`（精确到分），增值税 0。
  - crosscheck 换算断言接线验证：用合成旧口径夹具（`/tmp/bt/lo_values.json`，验证后已删除）跑 `node tests/crosscheck.test.mjs`，29 通过 / 0 失败；真实 LO 夹具重建仍归增量 6。
  - `grep -rn "rateGrid\[" src/ electron/` 无结果（引擎不再用魔法下标）；`grep` 确认 `calc.mjs` 内无残留旧公式（仅注释提及）。
- 已知遗留：
  - **Q2 默认与参考对照冲突，需主代理裁决**：按 §6.2 默认“11 项打折”，完整参考折前表算得折后措施 27436.31、折后除税价 282644.82，与参考折后表 10059.14 / 265267.65 相差 17377.17（= 11 项逐项打折后之和；参考折后表该 11 项全部为空，即折后 = 0）。本增量测试已将该差额作为可复现断言锁定（非测试失败）。若裁决改为“11 项折后不计（=0）”，只需在 `discount.mjs` 增加第三种处理，引擎与测试按裁决同步改；§12.1/§12.3 的“折后措施 10059.14、折后除税价 265267.65”断言在现行默认规则下无法由完整参考折前表得出。
  - **折后规费子项值与参考不同（模型定义所致）**：本增量按 §6.2 执行子项 = 折前值（社保 54981.68 / 公积金 8083.27 / 危伤 1929.18），参考折后表子项为打折后值（20838.06 / 3063.56 / 731.16），合计均为还原值（模型 64994.13 vs 参考 64994.14，差 0.01）。§12.1/§12.3 均未断言折后子项值；若要求子项按参考显示打折后值，需 §6.2 改为“子项打折、合计还原”的特殊规则。
  - 折后销项税额（Q5）：参考为空，v2 按折后基数公式算出并展示，属已知差异（§12.3 已列出）。
  - crosscheck 真实 LO 夹具仍缺失（附录 B Q8），换算后的断言待增量 6 夹具重建时用真实 LO 值验证。
  - 未做真机点按走查（本增量为引擎口径；UI/导出走查归增量 3/5 自体验 QA）。
```

### 增量 3（2026-10-14，实施者：子代理）
- 改了什么：
  - 架构：`docs/v2-design.md` 新增“增量 3 架构补充（2026-10-14）”一节（数据模型 / 模块划分 / 接口 / 关键版式决策 9 条 / 验证 / 影响面），追加、不改写历史；本增量中表五备注口径统一为“备注列恒为空”（参考仅安全生产费行有备注且为金额重复，属样本 peculiarity，v2 不复制）。
  - 新文件：`electron/printExport.cjs`（11 张表打印导出主入口 `exportBudgetBook` + `paginateTable3A`/`chunkSequence` 分页函数；CJS，主进程可同步 require）、`electron/printLayout.cjs`（版式常量，**生成文件，勿手改**）、`scripts/genPrintLayout.cjs`（读 `docs/print-layout-spec.raw.json` 生成版式常量）、`scripts/build_reference_fixture.py`（读 raw.json 机械提取表三甲/乙/丙/四甲行，生成对照夹具）、`tests/fixtures/reference-book.json`（参考结算书夹具）、`tests/print.test.mjs`（490 断言）、`scripts/verify-print-export.mjs`（LibreOffice 往返验证，不在 `npm test` 内）。
  - 改：`electron/excel.cjs`（删除旧简易版式 `exportProject`，避免两套导出并存；保留导入函数与 `exportQuotas`）、`electron/main.cjs`（IPC `excel:exportProject` → `excel:exportBudgetBook`，主进程按 `profileId` 取方案、fs 写真实路径）、`electron/preload.cjs`（`exportBudgetBook`）、`src/pages/Projects.jsx` / `ProjectDetail.jsx` / `Batch.jsx`（调用点改 `exportBudgetBook` + 传 `profileId`）、`tests/excel.test.mjs`（导出部分改走打印导出，断言 11 张表 + 表二人工费/除税价/调遣费 + 表一总计 + 表三乙小计；导入断言不动）、`package.json`（`test` 追加 `tests/print.test.mjs`）。
  - 不动：`src/engine/calc.mjs` / `src/engine/discount.mjs`（导出只渲染引擎值；Q2 裁决改变规则时只改引擎值，不动导出代码）、`electron/dbStore.cjs` / `src/lib/profiles.js`（无持久化字段新增，无 db 结构变更，无迁移）。
  - 版式常量模块位置偏离（supersedes §3.1/§5.4）：落在 `electron/printLayout.cjs`（CJS）而非 `src/engine/printLayout.mjs`（ESM），原因：主进程需同步 `require`，CJS 直接 require ESM 在 Electron 主进程不可靠。方法列模板偏离（§3.2）：`printExport.cjs` 内按 §6.4 自持一份方法模板（CJS/ESM 边界），`tests/print.test.mjs` 用合成用例逐项比对 `discount.mjs` 的 `renderMethodText` 输出锁定一致；仅 `dispatchFee` 例外，用实际数值写法（折前 `174X17X2`，折后 `174X17X2X37.9%`）。表三甲/乙/丙变体级行偏离（supersedes §5.2 字面读法）：引擎按定额编号汇总，无法满足“定额编号可重复，不合并”“`工日X0.5` 类变体行原样输出”，故按 `(定额编号, 变体)` 对 `project.quantities` 重新分组（孤儿/无效/零数量行按引擎规则排除），分组求和与引擎合计完全一致；`profile` 为 `null` 时回落引擎聚合行。
- 为什么：对应 §5（打印导出架构）、§5.4（版式常量）、§6.4（折后表方法列）、§3.2（打印导出模块）、§10 B1（导出走主进程 fs 写真实路径，不用浏览器下载冒充）。
- 验证证据：
  - `npm test`：引擎 12 + Excel 14 + 迁移 72 + savePatch 55 + discount 84 + print 490 = 727 通过 / 0 失败；crosscheck 跳过（`/tmp/bt/lo_values.json` 不存在，已知情况，附录 B Q8，归增量 6）。
  - `npm run build` 通过（36 modules transformed，220.20 kB JS）。
  - `node --check electron/printExport.cjs electron/printLayout.cjs electron/excel.cjs electron/main.cjs electron/preload.cjs` 通过；`grep -rn "exportProject" src/ electron/` 无结果（除测试文件外）。
  - 参考结算书对照（`tests/print.test.mjs`，夹具 `profile=null`）：11 张表名/顺序；合并区 封面 16 / 汇总 14 / 表一 15 / 表二 29×2 / 表三甲 78 / 表三乙 17 / 表三丙 17 / 表四甲 16 / 表五 35；封面 `275517.84元` + 工程编号 `9MA24CE0000019` + `2026年5月13日`；汇总表 G6 265267.65 / H6 10250.19 / J6/L6 275517.84；表一 G7 265267.65 / H8 10250.19 / J9/L9 275517.84；表二折前/折后逐项 = 夹具值（人工费 192918.18→73115.99 等）；表三甲分页符 1 个（29 行后）、合计 1269.189/790.666、`不取费` 行工日为空；表三乙小计 5580.00；表三丙合计 15455.26；表四甲甲供小计/总计 74246.30、无乙供分组、备注 `移交县公司`、单价 0.67714；表五甲安全生产费 10250.19、方法 `折前建安工程费除税价X2%`、总计 10250.19、生产准备行在总计之后。数值列扫描：文本型数字 0 个。
  - 方法列与 `discount.mjs` 逐项比对：合成用例 20 个表二键 × 折前/折后全部一致（`dispatchFee` 按实际数值写法单独断言）。
  - 合成工程回读：表二折后/折前左右列 == `result.table2After`/`table2Before` 全键；表一/汇总表总计 == `grandIncl`；表三甲 TXL3-187 按变体拆 2 行、合计 == `techDays/laborDays`；表三乙/丙小计/合计、表四甲小计/总计、表五安全生产费/总计 == 引擎值；`profile=null` 时表三甲按编号聚合 1 行。设备费路径：封面 276647.84、汇总表 E6 1000 / L6 276647.84、表一 E7 1000 / L9 276647.84、表四甲含 `『设备』` 分组。孤儿行：`UNKNOWN-999` 与 `不取费` 行均渲染、工日为空。`paginateTable3A`：0→[0]、22→[22]、23→[23,0]、24→[23,1]、40→[23,17]、41→[23,18,0]。溢出：表三甲 50 行 → 3 页（分页符 29/58）；表三乙 30 行 / 表四甲 30 行 → 各 2 页、表尾只在末页。
  - LibreOffice 往返验证（`node scripts/verify-print-export.mjs`，soffice 24.2.7.2 headless 转换）：1723 个非空单元格，0 处不一致（注：LO 会把字符串按字体拆成 richText 分段，脚本比对前已展平；首次比对 334 处“不一致”全属该表示差异，文本内容相同）。
  - 修正记录（本增量内发现并修复，非遗留）：空白行 C:D 合并曾误落表四甲（已移至表五甲）；表三甲/表五空白合并循环曾少最后一行（已补）；表四甲 F4/F5 曾误合并（raw 为两个独立单元格，单价(元)/除税价，已拆）；`ws.pageMargins` 赋值 ExcelJS 不序列化（改放 `pageSetup.margins`）；ExcelJS 读回丢 `pageMargins`（已改用 `pageSetup.margins` 断言）与 `rowBreaks`（改用 sheet XML 断言）。
- 已知遗留：
  - Q2 待裁决（只渲染引擎值，导出不重新决策）；Q5 销项税额已知差异（参考折前 39443.70 = 仅第一项、折后为空，v2 按折后基数公式 26843.94 / 含甲供增值税项，见 §12.3）；Q1 标题字样未确认（按 §5.1 表实现）。
  - 表三乙/丙 `profile` 为 `null` 时回落引擎聚合行（变体级重建仅在有 profile 时）。
  - 未做真机点按走查（导出按钮→选路径→打开文件归增量 5 自体验 QA；本增量导出函数已由纯函数测试 + LO 往返覆盖）。
  - crosscheck 真实 LO 夹具仍缺失（附录 B Q8，归增量 6）。
  - 参考与 v2 的有意差异（非 bug）：参考数值为文本型，v2 为数值型；参考方法列用全角 ％，v2 用 ASCII `%`；参考表五安全生产费方法列写数值 `10250.19`，v2 写方法表达式；参考折后规费子项为打折后值，v2 按 §6.2 子项 = 折前值（合计均为还原值，差 0.01 为舍入）。
```

### 增量 4（2026-10-14，实施者：子代理）
- 改了什么：
  - 架构：`docs/v2-design.md` 新增“增量 4 架构补充（2026-10-14）”一节（数据模型 / 模块划分 / 接口 / 关键决策 7 条 / 影响面），追加、不改写历史。
  - 新文件：`src/lib/libraryDefs.js`（11 视图定义：列/业务主键/行默认值/getRows/setRows，`rules` 拆变体/备选两视图，`rates` 展开写回）、`src/lib/libraryOps.js`（分类/合并/替换/分页/搜索/排序/删除影响计数/导入归一化）、`src/lib/undo.js`（撤销栈）、`src/components/LibraryTable.jsx`（通用库表：搜索+排序+分页+复选+行内编辑+删除确认+导入/导出/批量删除/新增）、`src/components/ConfirmDialog.jsx`（§8.4 确认框）、`src/components/ImportDiffPreview.jsx`（§8.3 差异预览）、`src/pages/Profiles.jsx`（配置方案管理页）、`electron/configIO.cjs`（方案/整库文件 IO，经 fs 写真实路径）、`tests/batch.test.mjs`（156 断言）。
  - 改：`electron/excel.cjs`（新增通用 `importLibrary`/`exportLibrary` + `EXCEL_COLUMNS`，列头与导入格式一致，布尔写 `是/否`；保留 `importQuotas`/`exportQuotas`）、`electron/main.cjs`（新增 IPC `db:exportProfile` / `db:importProfile`（名冲突追加“（导入）”）/ `db:exportBackup` / `excel:importLibrary` / `excel:exportLibrary`（`.json` 后缀写 JSON））、`electron/preload.cjs`（暴露上述 5 通道）、`src/pages/Settings.jsx`（重写为库管理壳：方案选择器 + 11 库 Tab + 打折规则 Tab；**删除**旧 Blob 下载 `exportConfig`（含死代码 `const { ipcRenderer } = { ipcRenderer: null }`）与旧 `confirm('点确定=合并…')` 定额导入）、`src/App.jsx`（撤销栈 + Toast（含 5 秒内“撤销”按钮）+ 顶栏常驻“撤销”按钮 + `Cmd/Ctrl+Z` + `updateDb(fn, {major})` + `profiles` 路由 + `pushUndo`/`notify` 下发）、`src/styles.css`（模态框/Toast/分页条/差异预览样式）、`package.json`（`test` 追加 `tests/batch.test.mjs`）。
  - 不动：`src/engine/calc.mjs`（`RATE_ITEMS` 兼容导出保留，Settings 已不再引用）、`electron/printExport.cjs`、`src/pages/Batch.jsx` / `Projects.jsx` / `ProjectDetail.jsx`（工程批量操作与工作台属增量 5）。
  - 偏离说明：费率视图不提供“全部替换”模式（`allowReplace=false`）：费率行集合由 `RATE_FIELD_DEFS` 派生、固定不可增删，文件缺行时无法定义“全表”语义，替换与合并对费率等价，故只提供合并；其余 10 视图均有替换模式（须输入当前方案名确认 + `major` 备份）。
- 为什么：对应 §8（批量操作设计：§8.2 通用操作、§8.3 导入差异预览、§8.4 删除确认）、§3（`LibraryTable` / `ImportDiffPreview` / `ConfirmDialog` / `Profiles.jsx` / `configIO.cjs`）、§10 B1（配置导出走主进程 fs 写真实路径）、B2（删除确认 + 撤销栈 + 删除前备份）、B4（分页文案 `共 N 条，显示 M–K 条`）、B7（映射表改/删按 `id`，不按编号首条匹配）、B8（费率页具名字段读写 + 增值税率四项可见可改）。
- 验证证据：
  - `npm test`：引擎 12 + Excel 14 + 迁移 72 + savePatch 55 + discount 84 + print 490 + 新增 batch 156 = 883 通过 / 0 失败；crosscheck 跳过（`/tmp/bt/lo_values.json` 不存在，已知情况，附录 B Q8，归增量 6）。
  - `npm run build` 通过（43 modules transformed，240.68 kB JS）。
  - `node --check electron/main.cjs electron/preload.cjs electron/excel.cjs electron/configIO.cjs` 通过。
  - 新增测试关键断言（`tests/batch.test.mjs`，156 断言）：导入分类新增 1 / 更新 1（diff 仅技工字段）/ 跳过 1 / 错误 2（必填为空 + 文件内主键重复）；合并时未勾选字段保留旧值、勾选字段采用新值、未勾选新增行不追加；替换后行数 = 文件有效行、已存在主键复用原 `id`；分页 120 条第 2 页 51–100、总页 3、越界钳制、2622 条末页 2601–2622、空表 `共 0 条，显示 0–0 条`；按 `id` 删除重复编号只删目标行（同编号行剩余 2 条）；`rules` 两视图 `setRows` 互不干扰；费率写回增值税率 0.13→0.11、`winterRate` 空 = `null` 不变 0、未知费率项目归错误组；`countReferences` 定额引用工程 `['工程A']`；导出回读定额（含同编号 2 行）/ 材料 1234.56 / 映射 5.95 / 费率 114 与空值 `null` / 表五布尔 `是/否`；解析错误行排除（2 条错误）、表头缺失整文件错误；Excel 列头与 `libraryDefs` 逐视图逐列对齐；`configIO` 真实路径导出/导入往返（名一致、费率 114、新 `id`）、非法 JSON 与缺失文件抛错。
  - `grep -rn "Blob\|ipcRenderer: null" src/ electron/` 无结果（B1 病灶清除）；`window.confirm` 仅剩 `LibraryTable.jsx` 的“导出全部还是仅筛选”非删除选择；`RATE_ITEMS` 仅剩 `calc.mjs` 兼容导出与 `store.js` 重导出，Settings 不再引用。
- 已知遗留：
  - 工程删除（`Projects.jsx` / `Batch.jsx` 批量删工程）仍用旧 `confirm`、无撤销，属增量 5（工作台 + B2 全量收尾）。
  - `saveQueue` 节流（B3）属增量 5；本增量行内编辑仍每次 `updateDb` 即发 `savePatch`。
  - 未做真机点按走查（库表分页/导入预览/撤销按钮/方案导入导出归增量 5 自体验 QA；本增量验证为纯函数测试 + `npm run build`）。
  - `RATE_ITEMS` 兼容导出仍在 `calc.mjs`，删除属后续清理。
  - 费率视图无“全部替换”模式（见上偏离说明）；`ImportDiffPreview` 的 `useState` 初始值依赖首次传入的 `classification`，调用方每次关闭后卸载组件，状态不会跨导入残留。
```

### 增量 5（2026-10-14，实施者：子代理）
- 改了什么：
  - 架构：`docs/v2-design.md` 新增“增量 5 架构补充（2026-10-14）”一节（数据模型 / 模块划分 / 接口 / 关键决策 10 条 / 影响面），追加、不改写历史。
  - 新文件：`src/lib/saveQueue.js`（保存节流队列：`createSaveQueue`，800ms 聚合 + `flush()` + 可注入定时器）、`src/lib/workbench.js`（工作台纯函数：孤儿/无效警告提取、重复编号、行状态、删孤儿行、忽略警告、工程撤销快照恢复）、`src/pages/Workbench.jsx`（单工程工作台：顶栏 + 左/中/右三区，不分页签；表二折后/折前/对照三态；孤儿警告条 + 定位 + 删孤儿行 + 忽略；增值税覆盖 + 表五手动项覆盖；配置方案切换确认；导出前 `flushSaves` + 孤儿确认）、`tests/workbench.test.mjs`（46 断言）。
  - 改：`src/App.jsx`（`updateDb` 不再每次即发 `savePatch`，改为推 `saveQueue` 聚合 800ms 后一次发送 + 冲突重试重放；新增 `flushSaves` 下发 Workbench；`beforeunload` 有待保存时提示 + 排空；`handleUndo` 新增 `project` / `projects` scope；`ProjectDetail` → `Workbench`）；`src/pages/Projects.jsx`（单删工程 `window.confirm` → `ConfirmDialog` + `projects` 撤销快照 + `major` 备份 + Toast 撤销；新增“删除选中”批量删除；导出成功 `alert` → `notify` Toast）；`src/pages/Batch.jsx`（新增 ⑤ 批量删除选中工程，同款确认 + 撤销 + `major`；`batchDiscount` 补齐 §2.3：同时写 `rateOverrides.discount` 并同步 `info.施工折扣`）；`src/pages/ProjectDetail.jsx`（删，由 `Workbench.jsx` 替代，§9.2；已确认仅 `App.jsx` 引用；文件进可恢复回收站，trash_id `20261014-064602-518ac996a8ef4570bccbddbce42dd057`）；`src/engine/calc.mjs`（仅注释：`ProjectDetail` → `Workbench`，零逻辑改动）；`src/styles.css`（新增 `.workbench` 三区、`.wb-warn`、`.wb-row-hl` 等样式）；`package.json`（`test` 追加 `tests/workbench.test.mjs`）。
  - 不动：`electron/*`（B1 核查通过，主进程零改动）、`src/engine/calc.mjs` 逻辑、`src/lib/undo.js`（快照约定新增 scope，栈本身不动）、`Settings.jsx` / `Profiles.jsx` / `LibraryTable.jsx` / 打印导出。
- 为什么：对应 §9（单工程工作台：§9.1 三区布局、§9.2 旧页面关系）、§10 B1（全量导出核查收尾）、B2（工程删除确认 + 撤销 + 删除前备份，收尾）、B3（saveQueue 节流保存）、B7（工作台孤儿警告展示接线）。
- 验证证据：
  - `npm test`：引擎 12 + Excel 14 + 迁移 72 + savePatch 55 + discount 84 + print 490 + batch 156 + 新增 workbench 46 = 929 通过 / 0 失败；crosscheck 跳过（`/tmp/bt/lo_values.json` 不存在，已知情况，附录 B Q8，归增量 6）。
  - `npm run build` 通过（vite build，254.08 kB JS；`ProjectDetail.jsx` 删除后无残留引用，`grep -rn "ProjectDetail" src/ electron/ tests/` 无结果）。
  - `node --check electron/main.cjs electron/preload.cjs` 通过。
  - 新增测试关键断言（`tests/workbench.test.mjs`，46 断言）：saveQueue 假时钟下 3 次 markDirty 只发 1 次（分支后写覆盖、baseVersion 取首个 7、major 取 OR）、`flush()` 立即发送、发送期间新编辑进第二桶（共 2 次）、真实定时器 20 次连续 markDirty 只发 1 次（取最后补丁）；行状态优先级孤儿 > 无效 > 重复；删孤儿行只删目标且不改原对象；忽略警告去重；单工程撤销（不存在时重插 / 存在时原位替换）、数组撤销整组写回、未知 scope 返回 false；联动计算：孤儿行 `UNKNOWN-999` 警告且表三甲无该行、无效行（qty −1）不计、数量 10→20 工日小计翻倍、切方案（技工费 114→200）后 `techFee/techDays = 200`。
  - B1 全量核查：`grep -rn "Blob|createObjectURL|download=" src/ electron/` 无结果；逐个核对 5 类导出全部走 `saveFile` + IPC + 主进程 `fs` 写真实路径（预算书 `excel:exportBudgetBook` / 库 `excel:exportLibrary` / 方案 `db:exportProfile` / 整库备份 `db:exportBackup`）。
  - B2 核查：删除路径上 `window.confirm` 清零，仅剩 `LibraryTable.jsx` 的“导出全部还是仅筛选”非删除选择（增量 4 已裁决保留）。
- 已知遗留：
  - `updateDb` 本地仍做整库深拷贝（见增量 5 架构补充决策 6：调用约定 `fn` 就地改 draft，不改调用约定无法做结构共享；磁盘成本已由 saveQueue + 备份节流消除，本地深拷贝约毫秒级）。
  - 未做真机点按走查（工作台三区 / 删除撤销 / 节流保存 / 导出按钮，本环境无 Electron 真机验证；验证为纯函数测试 + `npm run build` + 代码级核查，同增量 1–4 口径）。
  - `RATE_ITEMS` 兼容导出仍在 `calc.mjs`（增量 4 遗留）。
  - crosscheck 真实 LO 夹具仍缺失（附录 B Q8，归增量 6）。
  - Q2 待裁决（增量 2 遗留，本增量只渲染引擎值，不重新决策）。

### 增量 6（2026-10-14，实施者：子代理）
- 改了什么：
  - 架构：`docs/v2-design.md` 新增“增量 6 架构补充（2026-10-14）”一节（验收方案 / 夹具重建方案 / 影响面 / QA 修复条目），追加、不改写历史。
  - 新文件：`scripts/rebuild_crosscheck_fixture.py`（夹具重建脚本：读 v3.0 母版 → 填 crosscheck 场景 → LibreOffice headless 重算 → 写夹具 + meta；母版 SHA 不一致即拒绝生成；确定性输出）、`tests/fixtures/lo_values.json`（LO 真实重算夹具，29 键）、`tests/fixtures/lo_values.meta.json`（来源：母版路径 + SHA256 `ff5ed39f…4486d4` + LibreOffice 24.2.7.2 + 生成命令 + 场景 + workarounds）。
  - 改：`tests/crosscheck.test.mjs`（删跳过分支，改读仓库内 `tests/fixtures/lo_values.json`；缺失夹具时直接失败，不许再跳过；表一 3 项断言按新口径补安全生产费换算，见下“QA 修复”；其余 26 项断言一字不改）。
  - 不动：引擎 / 打印导出 / UI 业务逻辑零改动（本增量为测试与验收增量；QA 仅发现上述 1 个测试断言遗漏，无业务逻辑 bug）。
  - QA 修复（本增量内修完，非遗留）：真实 LO 夹具首次跑通时 crosscheck 26 通过 / 3 失败，失败全在表一合计（J9 引擎 23217.1 vs LO 23117.89；L9/L12 引擎 25181.56 vs LO 25109.14）。真因：表一合计含表五总计，安全生产费口径变化（1.5%+9% → 2%+0）同样影响表一；增量 2 换算断言时只改了表五两处断言与表一的 `taxAfter` 部分（+甲供增值税），漏了表一三处断言的安全生产费分量；增量 2 用合成夹具验证时该遗漏被掩盖（合成夹具的表一值按引擎值编造）。修复：J9 期望值 += `D6×0.005`（除税差额 99.21）；L9/L12 期望值 += `D6×0.005 − D6×0.015×0.09`（除税差额 99.21 − 旧安全生产费增值税 26.79，保留原有 +甲供增值税项）。LO 旧口径自洽验证：`D6+D23 = J9 = 23117.89`；`J9+I24+E23 = L9 = 25109.14`。修复后 crosscheck 29 通过 / 0 失败。
- 为什么：对应 §12（测试与验收计划）、§12.2（导出用 LibreOffice 真实重算验证）、§12.3（参考结算书逐项对数）、§1.5（自体验 QA 三项）、附录 B Q8（crosscheck 夹具重建并进仓库）。
- 验证证据：
  - `npm test`：引擎 12 + crosscheck 29 + Excel 14 + 迁移 72 + savePatch 55 + discount 84 + print 490 + batch 156 + workbench 46 = **958 通过 / 0 失败**（crosscheck 不再跳过）。
  - `npm run build` 通过（vite build，254.08 kB JS）。
  - `node --check tests/crosscheck.test.mjs` 通过；`python3 -m py_compile scripts/rebuild_crosscheck_fixture.py` 通过。
  - 夹具可复现性：`python3 scripts/rebuild_crosscheck_fixture.py` 连跑两次，`diff` 两次输出的 `lo_values.json` 逐项相同（确定性输出 `sort_keys`；LO 24.2.7.2）。
  - 夹具真实性：数值全部来自 LO 公式重算，未手编、未四舍五入；母版 SHA256 `ff5ed39f…4486d4` 与 v3.0 记录一致；两处母版 bug 绕行记入 meta（费率 G17:K17 冬雨季 0.018 plain 数；定额表 J1365/J1367 置 0），值仍由 LO 其余公式算出。`表二!I8` 在绕行后由 LO 真算出 156.96，与测试 `loFixed` 换算值一致，互为印证。
  - LibreOffice 导出往返：`node scripts/verify-print-export.mjs` → 比对 1723 个非空单元格，**0 处不一致**。
  - 参考结算书对数（独立复核，不复用 print.test 断言：`/tmp/verify_ref*.cjs` 导出参考夹具后逐项打出）：封面 275517.84 元；汇总表 265267.65 / 10250.19 / 275517.84；表一同；表二折前人工费 192918.18、技工 144687.55、普工 48230.63、主材 74246.30、辅材 222.74、机械 5580.00、仪表 15455.26、措施 67649.81、文明 2893.77、规费 64994.13、企管 52859.58、利润 38583.64、除税价 512509.64、销项税额 39443.70；表二折后人工费 73115.99、技工 54836.58、普工 18279.41、主材 74246.30、辅材 222.74、机械 2114.82、仪表 5857.54、措施 10059.14、文明 2893.77、规费 64994.14（参考值，模型值 64994.13，差 0.01 为 §6.5 预期舍入）、企管 20033.78、利润 14623.20、除税价 265267.65；表三甲合计 1269.189 / 790.666；表三乙小计 5580.00；表三丙合计 15455.26；表四甲总计 74246.30；表五甲安全生产费 10250.19、方法列 `折前建安工程费除税价X2%`、总计 10250.19。全部与 §12.3 对数表一致（除下列已知差异）。
  - 自体验 QA 代码级核查：`grep -rn "Blob|createObjectURL|download=" src/ electron/` 无结果（B1）；`grep -rn "rateGrid\[" src/ electron/` 无结果（B8）；删除路径 `window.confirm` 仅剩 `LibraryTable.jsx` 的“导出全部还是仅筛选”非删除选择（B2，增量 4 已裁决保留）；`grep -rn "TODO|FIXME|XXX|HACK" src/ electron/ tests/ scripts/` 无结果；`console.error` 仅剩 `electron/main.cjs` 的 `saveDb failed` 兜底日志；§11 定额库 `name` 含“不取费”= 0 条，7 条无编号行均未进库（“安装预留 缆架”TXL3-149 为带编号的另一条定额，非排除项；“预留+引上”无编号行无匹配）。
  - 文本型数字复核：导出文件全表扫描 67 处“疑似文本型数字”逐项确认为合法文本（封面 `275517.84元` 合并文本 4 格、表二/表五序号列、表四甲规格程式 `4.0`），无金额/工日以文本型存储（print.test 数值型断言亦通过）。
  - 已知差异（不是 bug，验收时不计入失败）：① **Q2 待裁决**：当前默认（11 项打折）下完整参考折前表算得折后措施 27436.31、折后除税价 282644.82，与参考折后表 10059.14 / 265267.65 相差 **17377.17**（`tests/discount.test.mjs` 已将该差额作为可复现断言锁定，非测试失败）；本增量不重新决策。② 折后规费子项值（模型：子项 = 折前值；参考：子项 = 打折后值；合计均为还原值，差 0.01 舍入）。③ 折后销项税额 Q5（参考为空/0，引擎按折后基数公式算出并展示；参考夹具导出时因夹具输入为空而为空，属夹具输入所致，非导出 bug）。④ 表五安全生产费方法列（参考写数值 `10250.19`，v2 写方法表达式）。⑤ 数值型 vs 文本型（参考转换后为文本型，v2 为数值型）。⑥ 方法列 `%` 全角 vs ASCII。
- 已知遗留：
  - **Q2 待裁决**（主代理裁决；本增量按当前默认验收，差额 17377.17 已在测试中锁定，裁决后只需改 `discount.mjs` 处理 + 同步测试，不动其他口径）。
  - Q1/Q3–Q7 未决（附录 B），本增量不重新决策；Q1 标题字样按 §5.1 表实现，确认后只改标题字符串。
  - 未做真机点按走查（本环境无 Electron 真机验证；验证为全量测试 + `npm run build` + LibreOffice 往返 + 代码级核查，同增量 1–5 口径；不搭临时旁路绕过走查）。
  - `updateDb` 本地整库深拷贝保留（增量 5 决策 6）；`RATE_ITEMS` 兼容导出仍在 `calc.mjs`（增量 4 遗留）。
  - 本增量不 push、不打 tag、不触发构建、不动 Release、不 git commit（§1.4：发布动作由主代理核验后执行）。

### 增量 7（2026-10-14，实施者：子代理）
- 改了什么：
  - 架构：`docs/v2-design.md` §6.2（第三种处理 + 裁决记录 + 零值清单）、§6.4（折后=0 方法列空）、§2.2（`discountRule` 字段）、§4.3 迁移（零值清单）、§12.1（discount.test 验收行）、§12.3（Q2 已裁决注）、附录 B Q2（已裁决 b）、附录 A（字段清单），追加本节，不改写历史增量记录（增量 2/6 中“Q2 待裁决 / 差额 17377.17 锁定”的表述为当时的状态记录，保留）。
  - 改：`src/engine/discount.mjs`（新增 `DEFAULT_ZERO_AFTER_DISCOUNT_KEYS`（11 项）+ `applyDiscount` 零值分支：折扣率 < 1 时折后=0，优先于不打折；折扣率=1 时不生效）、`src/lib/profiles.js`（`DEFAULT_DISCOUNT_RULE` 含 `zeroAfterDiscountKeys`；重导出新常量）、`src/engine/calc.mjs`（透传 `zeroAfterDiscountKeys` 并存入结果 `discountRule`）、`electron/printExport.cjs`（镜像默认零值集 + 折后表零值行方法列置空）、`src/pages/Settings.jsx`（打折规则页新增“折后=0”勾选列，与不打折列互斥）。
  - 测试同步：`tests/discount.test.mjs`（完整参考折前表折后措施/除税价改为裁决 (b) 值；零值清单可定制：清空恢复打折、移入不打折清单保持折前值、两清单同时含某项时折后=0 优先；discount=1 时含 Q2 键在内全部不变）、`tests/print.test.mjs`（调遣/搬运/冬雨折后方法列改为 null；第 2 节方法列合成用例 Q2 键预期 null）、`tests/migration.test.mjs`（迁移后 `zeroAfterDiscountKeys` 11 项）。
  - 不动：规费子项显示（用户未裁决，§6.2 保持现状：子项 = 折前值、合计 = 还原值）；参考夹具 `tests/fixtures/reference-book.json`（其 `table2After` 本就已是裁决 (b) 的值）；crosscheck 夹具与断言（场景折扣率 = 1，零值不生效）。
- 为什么：用户 2026-10-14 裁决 Q2 选 (b)——参考结算书折后表中 11 项措施费为空（=0）。对应 §6.2、附录 B Q2。
- 验证证据：
  - `npm test`：引擎 12 + crosscheck 29 + Excel 14 + 迁移 74 + savePatch 55 + discount 103 + print 492 + batch 156 + workbench 46 = **981 通过 / 0 失败**。
  - `npm run build` 通过（vite build，255.07 kB JS）。
  - LibreOffice 导出往返：`node scripts/verify-print-export.mjs` → 比对 1706 个非空单元格，**0 处不一致**（较增量 6 的 1723 少 17 格：折后表 Q2 方法列 17 格置空——右栏 7 行 × 2 格 + 左栏 3 行；用旧版 `printExport.cjs` 重建对照导出逐格 diff 核对，17 格全部为 Q2 方法列，无其他单元格变化；折前表 207 格一格未动）。
  - 参考结算书对数（独立复核，不复用测试断言：`applyDiscount(参考折前表, 默认规则)` 逐项打出）：11 项折后全部 = 0；折后措施 10059.14（= 参考）；折后除税价 265267.64（参考 265267.65，差 −0.01 为规费舍入，容差内）；与参考折后表逐项比对（容差 0.02）不一致的仅 5 处，全部是已列出的已知差异：规费子项（社保/公积金/危伤，未裁决）、销项税额（Q5）及由此派生的含税价。
- 已知遗留：
  - 规费子项显示仍未裁决（§6.2 保持现状）；Q1/Q3–Q7 未决（附录 B），本增量不重新决策。
  - 未做真机点按走查（本环境无 Electron 真机验证；验证为全量测试 + `npm run build` + LibreOffice 往返 + 代码级核查，同增量 1–6 口径）。
  - 本增量不 push、不打 tag、不触发构建、不动 Release、不 git commit（§1.4：发布动作由主代理核验后执行）。

### 增量 8（2026-10-14，实施者：子代理）
- 改了什么：
  - 架构：`docs/v2-design.md` 新增 §3.4（打包清单口径：`build.files` 闭包 + asar 决定 + 动态 import 规则 + CI Verify 联动）、§12.1 新增打包闭包测试行，追加本节。
  - 改：`package.json`（`build.files` 新增 `src/lib/profiles.js` + `src/engine/rates.mjs` + `src/engine/discount.mjs`；新增 `"asar": false`；`version` 2.0.0 → 2.0.1）、`.github/workflows/build.yml`（macOS Verify：不再断言 `app.asar` 存在，改为断言 unpacked 布局下 `Resources/app/src/lib/profiles.js` + `dist/index.html` + `exceljs` 存在 + `codesign --verify`）。
  - 测试新增：`tests/packaging.test.mjs`（扫描 `electron/*.cjs` 动态 import 目标，逐个断言被 `build.files` glob 覆盖；断言 `asar === false`），接入 `npm test` 链。
  - 改（冒烟发现，见验证证据）：`src/App.jsx`（键盘撤销的 `useEffect` + `updateDb` / `handleUndo` 移到 early return 之前，修 Hooks 顺序违规导致的空白页；`project` 取值加 `db &&` 守卫）+ 测试新增 `tests/hooks.test.mjs`（静态检查：App.jsx 最后一个 Hook 调用在第一个 early return 之前）。
- 为什么：v2.0.0 真机反馈“Mac 版本打不开”——点软件看不到界面，只能看到英文菜单（用户截图）。根因见 §3.4：`files` 漏 `src/`，`main.cjs:8` 的动态 import 在打包后解析失败 → `loadDb()` 抛错 → `whenReady` 回调拒绝 → `createWindow()` 从未执行，连 `activate` 处理器也没注册。v1 无此问题（v1 主进程不 import src 文件）。冒烟另发现 App.jsx Hooks 违规（见上）：此前被 loadDb 失败掩盖，修完打包闭包后才暴露为“有窗口、无界面”。
- 验证证据：
  - 复现（未修复代码 Linux 打包）：`npx electron-builder --linux --x64` 打包后 `TXBUDGET_SMOKE=1` 运行，`UnhandledPromiseRejectionWarning: ERR_MODULE_NOT_FOUND …/app.asar/src/lib/profiles.js`，无 SMOKE 行、无窗口——与用户“有菜单栏、无窗口”一致。
  - 修复后重新打包：打包布局 `resources/app/`（无 `app.asar`），`src/lib/profiles.js` + `src/engine/rates.mjs` + `src/engine/discount.mjs` 均在包内；冒烟 `SMOKE hasApi=true text="通信概预算\n工程批量生成定制设置配置方案\n451号文 · 宇翔表二格式 · 0 个工程\n…暂无工程…"`，无渲染进程报错。
  - 冒烟另发现 App.jsx Hooks 违规：修完打包闭包后首次冒烟 `SMOKE hasApi=true text=""` + 渲染进程 `Minified React error #310`；开发模式复现为 Hooks 顺序错误（App.jsx:39，`Rendered more hooks than during the previous render`）；修完后 dev 与打包冒烟文本均正常（见上）。
  - `npm test`：**998 通过 / 0 失败**（引擎 12 + crosscheck 29 + Excel 14 + 迁移 74 + savePatch 55 + discount 103 + print 492 + batch 156 + workbench 46 + packaging 14 + hooks 3）。
  - `npm run build` 通过（255.05 kB JS）。
  - packaging 测试反向验证：旧 files 清单 → 5 失败（asar + profiles.js 覆盖 + 闭包 3 项）；恢复后 14/0。
- 已知遗留：
  - 规费子项显示仍未裁决（§6.2 保持现状）；Q1/Q3–Q7 未决（附录 B），本增量不重新决策。
  - 未做 Mac/Windows 真机点按走查（本环境为 Linux 打包 + xvfb 冒烟；Mac/Windows 真机行为以用户验收为准）。
  - 本次 QA 中 `/tmp` tmpfs 曾满（另一并行任务的 DMG 文件），测试与打包用 `TMPDIR` 重定向到仓库内 `.tmp-pack`（QA 后已清理）；`npm test` 在默认 TMPDIR 下曾因 ENOSPC 中断，非测试本身失败。
- 发布：本任务按主代理指令直接发布 v2.0.1（push + tag `v2.0.1` + CI），不改 v2.0.0 的 Release、不移动任何 tag。

### 增量 9（2026-10-14，实施者：子代理）
- 改了什么（v3.0，§13 + §13.11，重叠处以 §13.11 为准）：
  - 导航：`src/App.jsx`（旧 4 按钮顶导航删除；导航状态 `section`/`tab` 单一事实源）+ 新增 `src/components/Sidebar.jsx`（可收起侧边栏，一次一个功能）/ `TopBar.jsx`（新建/打开/保存/工程管理/导出 + 当前工程名 + 当前方案名 + 保存状态 + 退出=关闭窗口）/ `StatusBar.jsx`（底栏操作提示随视图变化 + 工程/方案/选中行计数）。
  - 保存模型：`src/lib/saveQueue.js`（新增 `onFlushStart` / `onSettled({source})` 完成通知，`flush({source})` 区分手动/自动）+ `src/lib/v3.js`（保存状态机 `saveStatusTransition` / `saveStatusText`：dirty ● 未保存 → saving 保存中… → saved ✓ 已保存 HH:MM / 已自动保存 HH:MM）；保存仍走 `db:savePatch`，800ms 自动保存保留兜底，关闭前未保存仍提示。
  - 工作量分组：`src/pages/Workbench.jsx` 重写为编排器（各标签共享同一 `project`/`result` 引用）+ `src/components/workbench/` 下 `WorkbenchInfo.jsx`（分组表单：基本信息/参建单位/编制信息/取费与折扣；新增可选 `info.施工单位` / `info.设计单位`；取费标准下拉切换工程方案；打折单选派生自 `施工折扣`）/ `WorkbenchQuantities.jsx`（表三甲：定额联想 + 数量回车下一行 + 右侧常驻小计建安费/除税价）/ `WorkbenchTables.jsx`（材料汇总三组、安装设备 `table4Equip` 子集、机械表三乙、仪器仪表表三丙统一大表、费用表二三态、表五完整视图）。
  - 取费视图：新增 `src/components/FeeTreeTable.jsx`（左树 + 右表，列：费用名称/计算基数/费率/金额/计算式；费率可编辑走现有 savePatch）+ `src/lib/v3.js`（`FEE_TREE` 由 `DISCOUNT_LINE_DEFS` 派生、`feeRowsForNode`、`feeBasisText`；不新增费率数据模型）。
  - 表五视图：`WorkbenchTables.jsx` 的 `WorkbenchTable5`（完整表格，公式列由 `table5Formula` 生成，安全生产费“折前建安工程费除税价 × {rate}%”，手动项“手动输入”；启用沿用 `table5Overrides.enabled`，金额取 `result.table5`）。
  - 配置方案修逻辑：`src/lib/v3.js`（`settings.editingProfileId`，缺省回落 `activeProfileId`；`setEditingProfileId` 不碰 `activeProfileId`）+ `src/pages/Profiles.jsx`（每行【编辑内容】置 `editingProfileId` 并跳基础库页、【设为默认】、复制、导出、删除）+ `src/pages/Settings.jsx`（基础库/取费规则页编辑 `editingProfileId` 方案；取费规则含费率左树+右表 / 表五费用 / 打折规则 / 关联规则；设置页为整库备份/导入导出）。
  - 工程列表：`src/pages/Projects.jsx`（最近工程置顶，按 `project.lastOpenedAt` 降序；`App.openProject` 写 `lastOpenedAt`）。
  - 导出勾选：新增 `src/components/ExportPicker.jsx`（左树勾选 11 张表，默认全选，分组全选/取消）+ `electron/printExport.cjs`（`opts.include` 与 `includeSheets` 同义）+ `electron/main.cjs`（`excel:exportBudgetBook` 透传 `include`）+ 导出时选择存 `settings.exportSelection`。
  - 导出布局：`docs/print-layout-spec.raw.json`（13 处列宽修正：汇总表 E/F→9.44 H→10.13；表一 E→10.13；表三甲 E→9.44 H→12.46；表三乙 H→10.83；表三丙 H→10.83 J→11.51；表四甲 F→11.09；表五甲 F/G→12.2；重序列化，值变更仅此 13 处）后重跑 `node scripts/genPrintLayout.cjs`（未手改 `printLayout.cjs`）；`electron/printExport.cjs`（表名标题 + 编制说明标题 → Noto Sans CJK SC：标题 18 bold、编制说明标题 21 bold、封面标题 36 bold；其余宋体/黑体照旧；另修正表五表头合并区 C3:D3 → C3:D4，与 raw.json 合并区一致——此前代码与参考不一致，print.test 只断言合并区数量未发现）。
  - 界面宽松：`src/styles.css`（表格行高/内边距加大、关键数字加大字、侧边栏/顶栏/底栏/费率树/导出树/联想下拉样式）。
  - 不动：计算口径、引擎、迁移、IPC（除导出 include 透传）、打包、Q2/规费未决口径；不新增材料行字段；11 张表版式结构不动（只改列宽 + 标题字体 + 表五合并区修正 + 勾选）。
  - 测试新增 7 个文件（接入 `npm test`）：`tests/saveStatus.test.mjs`（15）、`tests/profileEditTarget.test.mjs`（12）、`tests/exportPicker.test.mjs`（15）、`tests/layoutCompare.test.mjs`（601）、`tests/feeTree.test.mjs`（21）、`tests/projectInfo.test.mjs`（21）、`tests/table5Formula.test.mjs`（19）。
- 为什么：用户真机走查 v2.0.1 反馈（界面粗糙拥挤、无保存按键、配置方案逻辑错误、导出与参考不一致）+ 宇翔 moto 截图 17 页逐页核对（§13.11，只学结构交互，不抄界面素材）。
- 验证证据：
  - `npm test`：**1702 通过 / 0 失败**（原 998 + 新增 704：15+12+15+601+21+21+19）。
  - `npm run build` 通过（277.84 kB JS）。
  - LibreOffice 导出往返：`node scripts/verify-print-export.mjs` → 1708 个非空单元格，0 处不一致。
  - 布局比对：`tests/layoutCompare.test.mjs`（601 断言）——导出 vs 参考结算书（LO 转换后）逐项比对列宽/行高/合并/页边距/页面设置/标题字体，0 失败。
  - 打包后 Linux 冒烟：`npx electron-builder --linux --x64` 后 `TXBUDGET_SMOKE=1` 运行打包应用（xvfb 下），`SMOKE hasApi=true`，文本含顶栏（新建/打开/保存/工程管理/导出 + ✓ 已保存）、侧边栏（工程/当前工程九项/批量生成/基础库/取费规则/配置方案/设置）、底栏操作提示，窗口出现、界面完整、无渲染报错（dbus/GPU 行仅为无头环境噪音）。
- 发布修正（v3.0.0 tag 首次 CI 失败后修复）：
  - 现象：tag 推送触发的 Build macOS（38589334997）与 Build Windows（38589334895）均在 Test 步骤失败。
  - 根因：`tests/layoutCompare.test.mjs` 直接读仓库外的参考 `.xls`（`~/workspace/user/files/`），CI 环境无此文件 → 退出 1。其余测试在 CI 中均已通过（链式执行停在 layoutCompare）。
  - 修：参考版式提取为仓库内 fixture `tests/fixtures/reference-layout.json`（仅列宽/行高/合并/页边距/页面设置/标题字体，不含金额与单位信息），测试改为比对 fixture；断言数仍为 601，本地 `npm test` 仍 1702 通过 / 0 失败。
  - 因 v3.0.0 tag 刚创建、未发布、无 Release 资产，tag 随修复提交移动到新提交（原提交 e35e87e 仅含坏测试，未产生任何发布物），CI 重新触发。
- 已知遗留：
  - 未做 Mac/Windows 真机点按走查（本环境为 Linux 打包 + xvfb 冒烟；Mac/Windows 真机行为与 v3 界面点按以用户验收为准）。
  - `raw.json` 本次重序列化导致全文件格式刷新（值变更仅 13 处列宽）；后续改版式仍以改值 + 重跑生成器为准。
  - 规费子项显示仍未裁决（§6.2 保持现状）；Q1/Q3–Q7 未决（附录 B），本增量不重新决策。

### v2 发布候选证据清单（增量 1–6 汇总，2026-10-14）
- 候选命名：`v2-增量6-发布候选-20261014`（仅用于沟通，不作为 git tag；真正的版本号/tag 由主代理在发布时定）。
- 各增量变更：
  - 增量 1：数据模型 + 多配置方案 + v1→v2 迁移（`configurationProfiles` / `profileId` / 行 `id` / `db:savePatch` / 原子写 + 备份节流）。测试：迁移 72 + savePatch 55。
  - 增量 2：引擎口径（逐项打折双表二、安全生产费 2%+VAT 0、汇总表新口径、表五可配置、孤儿/无效/重复警告）。测试：discount 84。
  - 增量 3：打印导出 11 张表（版式常量生成器 + `printExport` + 参考夹具对数 + LO 往返）。测试：print 490。
  - 增量 4：库管理 + 批量操作（11 视图通用库表、导入差异预览四组、撤销栈、配置方案管理页、主进程 fs 真实路径导出）。测试：batch 156。
  - 增量 5：单工程工作台（三区 + 表二三态 + 孤儿警告条 + 增值税/表五覆盖 + 导出前 flush）+ B1/B2/B3 收尾。测试：workbench 46。
  - 增量 6：测试与验收（crosscheck 真实 LO 夹具进仓库 + 取消跳过 + 表一断言遗漏修复 + 全量验收 + 自体验 QA）。测试：crosscheck 29。
  - 增量 7：Q2 裁决实施（11 项措施费折后=0，见增量 7 一节）。测试：discount +19、print +2、迁移 +2。
- 总测试数：`npm test` **981 通过 / 0 失败**（引擎 12 + crosscheck 29 + Excel 14 + 迁移 74 + savePatch 55 + discount 103 + print 492 + batch 156 + workbench 46）。
- 构建：`npm run build` 通过（255.07 kB JS）。
- 验收结论：§12.4 验收标准 1–4 项均满足（全量测试通过；11 张表导出 LO 回读 1706 单元格 0 不一致；参考结算书对数表全部通过，除已列出的已知差异；自体验 QA 通过，变更记录完整）。**Q2 已裁决 (b)（2026-10-14 用户裁决，见增量 7），此前 17377.17 差额已消除，不再阻塞发布裁决**；发布前仍须主代理核验后打 tag 走 CI。

## 13. v3.0 重做（2026-10-14，用户确认方案后实施）

> 来源：用户真机走查 v2.0.1 后反馈（界面粗糙拥挤、无保存按键、配置方案逻辑错误、导出与参考不一致）+ 宇翔 moto 截图（17 页 PDF）+ 用户两次结构修正。
> 结构修正历程（以后续为准）：初版方案为“表三/表四”分组、四平级标签（机械、仪器仪表合一带子标签）→ 用户第一次修正：表四也在表三一览里，四个平级标签 → 用户第二次修正（最终）：分组叫“工作量”，五平级标签，机械/仪器仪表拆为两个平级标签，不再是子标签。

### 13.1 目标与非目标

- 目标：侧边栏导航（一次一个功能）、显式保存按键与保存状态、配置方案修逻辑错误、工作量分组、导出前勾选、导出布局与 2024 结算书一模一样、界面宽松。
- 非目标 / 不动：计算口径（§6、§7）、数据格式（v2 数据文件继续可用，不做迁移）、11 张表版式结构（只改列宽 + 字体 + 加勾选）、Q2/规费等未决口径（附录 B）。

### 13.2 数据模型（增量字段，全部向后兼容，无迁移）

| 字段 | 位置 | 语义 | 缺省（旧数据） |
|---|---|---|---|
| `settings.editingProfileId` | `settings` | 基础库/取费规则页的**编辑目标**方案 | `settings.activeProfileId` |
| `settings.exportSelection` | `settings` | 上次导出勾选的表名数组 | 全部 11 张表 |
| `project.lastOpenedAt` | `Project` | 工程最近打开时间（毫秒），供工程列表“最近置顶”排序 | 无 → 按原有顺序 |

- 以上字段全部可选，读取时容错回落；旧数据文件无这些字段时行为与 v2 一致，不做迁移、不改写旧文件结构。
- 材料行**不新增字段**（设备/材料区分沿用现有 `supply`，见 §13.5）。

### 13.3 模块划分（文件级）

| 文件 | v3.0 动作 |
|---|---|
| `src/App.jsx` | 侧边栏 + 顶栏 + 保存状态 + 导航状态（`section`/`tab`）+ 按钮；旧 4 按钮顶导航删除 |
| `src/pages/Projects.jsx` | 工程列表：最近工程置顶（按 `lastOpenedAt`） |
| `src/pages/Workbench.jsx` | 拆分：工程信息 / 工作量（5 标签） / 费用（表二） / 表五 / 报表导出；工作量 5 标签拆为独立组件，禁止单个 500+ 行文件；各标签共享同一 `project`/`result` 引用，保证数据一致 |
| `src/pages/Settings.jsx` | 基础库 + 取费规则：编辑目标改为 `editingProfileId`，不再碰 `activeProfileId` |
| `src/pages/Profiles.jsx` | 方案列表：每行复制/导出/删除 |
| `src/pages/Batch.jsx` | 批量生成：功能不动，仅接入新导航 |
| `src/components/` | 新增 `Sidebar.jsx`、`TopBar.jsx`（含保存状态）、`ExportPicker.jsx`、`QuotaAutocomplete.jsx`（定额编号联想） |
| `src/lib/saveQueue.js` | 增加完成通知（`onSettled` 回调或 flush 完成事件），供保存状态用；合并/节流语义不变 |
| `electron/printExport.cjs` | 导出勾选（`include` 参数已存在，勾选直接传 `include`）；字体：标题/说明 → Noto Sans CJK SC（§13.6） |
| `docs/print-layout-spec.raw.json` + `scripts/genPrintLayout.cjs` | 列宽修正（§13.6），改 raw.json 后重跑生成器，不手改 `printLayout.cjs` |
| 测试 | 新增 4 个测试文件（§13.10） |

### 13.4 导航（侧边栏）

```
工程（工程列表，最近工程置顶）
当前工程（未选中工程时分组禁用，提示先选工程）
├─ 工程信息
├─ 工作量（分组，五平级标签，不拆到不同分组）
│ ├─ 表三甲（编制录入定额）
│ ├─ 材料汇总（表四甲）
│ ├─ 安装设备（表四甲）
│ ├─ 机械（表三乙）
│ └─ 仪器仪表（表三丙）
├─ 费用（表二）
├─ 表五
└─ 报表导出
批量生成
基础库（定额库 / 材料库 / 仪器仪表库 / 机械库 / 映射关系）
取费规则（费率 / 表五费用 / 打折规则 / 关联规则）
配置方案
设置（整库备份 / 导入导出）
```

- 规则：一次只显示一个功能；侧边栏可收起；导航状态 `section`/`tab` 单一事实源，旧 `view`（`projects`/`detail`/`batch`/`settings`/`profiles`）映射到新导航，不保留两套并行状态。
- 顶栏：当前工程名 + 当前工程所用配置方案名 + 保存状态 + +；在基础库/取费规则页时另显示“正在编辑方案：XXX”（`editingProfileId` 对应方案）。

### 13.5 工作量五标签（数据来源）

| 标签 | 内容 | 数据来源 |
|---|---|---|
| 表三甲 | 编制录入定额：定额编号输入带联想（编号/名称关键字候选），输完数量回车直接下一行；右侧常驻小计（建安费/除税价） | 工程 `quantities`（现有 Workbench 中区） |
| 材料汇总（表四甲） | 甲供 / 乙供 / 设备三组，同导出表四甲结构 | `result.table4A` / `table4B` / `table4Equip` |
| 安装设备（表四甲） | `table4Equip` 子集 | 同上，`supply = '设备'` 的行 |
| 机械（表三乙） | 现有表三乙 | `result` 表三乙 |
| 仪器仪表（表三丙） | **统一大表**，不拆碎。列：定额编号 / 项目名称 / 单位 / 数量 \| 仪器仪表名称 \| 单位定额值 数量 / 单价 \| 合计值 数量 / 合计 | `result` 表三丙 |

**设备/材料标记（已查实，无需新增字段）：**
- 材料库 `supply ∈ {甲供, 乙供, 设备}`（`src/lib/libraryDefs.js` `SUPPLY_OPTS`）；映射表同样用该选项。
- 引擎 `buildMatTable(supply)` 按 `supply` 分组（`src/engine/calc.mjs`）；`table4Equip = buildMatTable('设备')` → `t1.equipFee`（需要安装的设备费）。
- 编制说明“不安装设备费：0.00”为硬编码，与参考结算书一致。
- 结论：安装设备视图 = `supply = '设备'` 子集，不加新字段，v2 数据零改动。
- 局限（本次不做）：模型内不区分“需要安装”与“不需要安装”的设备（不安装设备费恒 0）。如将来需要，加可选 `installRequired`（默认 `true`）字段，旧数据缺省 `true`；本次不扩大范围。

### 13.6 导出（勾选 + 布局与结算书一模一样）

- 勾选：导出前勾选 11 张表，默认全选，选择存 `settings.exportSelection`；导出时传 `include`（`printExport.cjs` 已支持 `include.has(...)`）。
- 列宽修正（来源：LibreOffice 解析 2024 结算书的真实列宽；旧版式提取把原文件未显式写宽度的列填了默认 `9.13671875`，导致 7 张表偏窄）：

| 表 | 修正列 → 真实列宽 |
|---|---|
| 汇总表 | E → 9.44，F → 9.44，H → 10.13 |
| 表一 | E → 10.13 |
| 表三甲 | E → 9.44，H → 12.46 |
| 表三乙 | H → 10.83 |
| 表三丙 | H → 10.83，J → 11.51 |
| 表四甲 | F → 11.09 |
| 表五甲 | F → 12.2，G → 12.2 |

- 字体：各表表名标题 + 编制说明 → **Noto Sans CJK SC**（与原文件一致：标题 Noto 18 bold、编制说明标题 Noto 21 bold）；其余宋体/黑体照旧（数据 宋体 10、表尾 宋体 10、封面 宋体 36 bold 等）。
- 措辞：与结算书逐字一致，不动。
- 版式结构：11 张表、合并、行高、页边距、纸张、缩放均不动，只改列宽 + 字体。

### 13.7 保存模型

- 状态机：`dirty`（● 未保存）→ `saving`（保存中…）→ `saved`（✓ 已保存 HH:MM）；800ms 自动保存触发时状态写“已自动保存 HH:MM”。
- 按钮：点按 → `flush()` 排空队列 → 写盘完成 → `saved`。800ms 自动保存保留当兜底。关闭前有未保存仍提示（现有 `beforeunload`）。
- 接口：`saveQueue` 增加完成通知；App 持有 `saveState`；`updateDb` → `dirty`；flush 完成 → `saved` + 时间戳。保存仍走 `db:savePatch`，不改存储格式。

### 13.8 配置方案（修逻辑错误）

- 现状 bug：Profiles 页无“编辑内容”入口；Settings 页用 `settings.activeProfileId` 既当编辑目标又当新建默认，改一个动另一个。
- 修：`settings.editingProfileId` = 编辑目标（缺省 `activeProfileId`）；`activeProfileId` 只管新建工程默认。Settings/基础库/取费规则页编辑 `editingProfileId` 方案，不碰 `activeProfileId`。
- Profiles 列表每行：（置 `editingProfileId` 并跳到基础库页，顶栏显示“正在编辑方案：XXX”）、（置 `activeProfileId`）、复制、导出、删除。

### 13.9 影响面

- 不动：引擎（`calc`/`discount`/`rates`）、迁移、db 格式、IPC、打包。
- 动：`App.jsx`、Workbench 拆分、`Settings.jsx`（编辑目标）、`Profiles.jsx`（列表操作）、`Projects.jsx`（最近置顶）、`styles.css`（侧边栏/顶栏/宽松布局）、`printExport.cjs`（勾选 + 字体）、`raw.json`（列宽）+ 生成器、测试。
- 风险：Workbench 拆分是最大改动面，需保证各标签数据一致（同一 `project`/`result` 引用）；导航状态迁移（旧 `view` 值映射到新 `section`/`tab`，不留两套并行状态）。

### 13.10 测试与验收（v3.0）

- 新增测试：
- `tests/saveStatus.test.mjs`：保存状态机（dirty → saving → saved；自动保存文案；保存按钮排空队列）。
- `tests/profileEditTarget.test.mjs`：编辑目标与默认分离（改 `editingProfileId` 不动 `activeProfileId`；缺省回落；旧数据无字段时行为与 v2 一致）。
- `tests/exportPicker.test.mjs`：勾选默认全选 / 持久化 / 导出 `include` 生效（只出勾选的表）。
- `tests/layoutCompare.test.mjs`：导出布局 vs 结算书（列宽 / 行高 / 字体 / 合并 / 页边距逐项比对，差一处即失败；以参考结算书实测布局为准）。
- 全量 `npm test` 通过；`npm run build` 通过；打包后 Linux 冒烟（`TXBUDGET_SMOKE`）窗口出现、界面完整、无渲染报错（v2.0.0 教训：不启动打包后的应用不许发布）；LibreOffice 导出往返 0 不一致。
- 验收：用户真机点按走查（侧边栏、保存、配置方案、导出勾选、导出布局与结算书一模一样）。
- 实施后追加“增量 9”记录（变更 + 验证证据 + 遗留），格式同增量 1–8。

### 13.11 宇翔对照（17 页截图逐页核对，实施前置）

> 来源：用户上传的宇翔 moto 截图 PDF（17 页，`~/workspace/user/files/3c75cd02a4a5be63d2edebfa86a6ab59.pdf`），2026-10-14 逐页看完后落进架构。只学结构与交互，**不抄宇翔的界面素材**（图标/图片/文案/配色/品牌插图）。
> 本节补充 §13.4–§13.8；重叠处以本节为准（更晚、用户亲定）。

#### 13.11.1 逐页核对（P1–P17 截图 → v3.0 落点）

| 页 | 宇翔画面 | v3.0 落点 |
|---|---|---|
| P1 | 定额编辑：左功能标签 + 表格 + 右键菜单（插入/删除/复制/粘贴/报表） | 工作量 → 表三甲；右键菜单不学（见 §13.11.6） |
| P2 | 工程管理列表 + 右键菜单 + 底部功能标签 | 工程列表（搜索 + 最近置顶） |
| P3 | 工程量表（定额行） | 工作量 → 表三甲 |
| P4 | 材料表 | 工作量 → 材料汇总 |
| P5 | 工程量表 + 右键 → 报表子菜单（工程量表/工程费用表/导出 Excel） | 工作量 → 表三甲；报表入口统一到“报表导出” |
| P6 | 取费文件对话框（`.mqf`）+ 费用表 | 配置方案（导入/导出方案文件）；取费文件对话框不学 |
| P7 | 汇总表/表一编辑器（小型建筑工程费/需要安装的设备费/不需要安装的设备、工器具费/…） | 费用（表二）+ 报表导出；列宽/措辞以结算书为准（§13.6） |
| P8 | 仪表/机械表 | 工作量 → 机械 / 仪器仪表 |
| P9 | 定额编辑 + 右键 → 报表子菜单 | 同 P5 |
| P10 | 机械/仪表视图 | 工作量 → 机械 / 仪器仪表 |
| P11 | 定额编辑 | 工作量 → 表三甲 |
| P12 | **报表预览：左侧树勾选要出的表** | 报表导出 → 导出勾选（左树勾选，§13.6） |
| P13 | **取费视图：左费用层级树 + 右表（费用名称/计算基数/费率/金额）** + 取费文件菜单 + 底栏红字操作提示 | 取费规则 → 费率视图左树+右表（§13.11.2）；底栏操作提示（§13.11.5） |
| P14 | 取费视图（另一状态） | 同 P13 |
| P15 | **工程信息表单**（项目编号/工程名称/建设单位/施工单位/设计单位/监理单位/编制人/审核人/编制日期/工程类别/取费标准/折扣率/打折选项单选 + 勾选）+ 品牌插图 | 当前工程 → 工程信息完整表单（§13.11.3）；品牌插图不抄 |
| P16 | 取费视图：左树 + 右表 + **计算式列**（人工费X..%、直接费X..%） | 费率视图右表加计算式/依据列（§13.11.2） |
| P17 | **其他项目（表五）：费用名称/计算基数/费率/金额 + 启用勾选 + 公式显示**（安全生产费行显示完整公式） | 当前工程 → 表五视图（§13.11.4） |

#### 13.11.2 取费视图：左树 + 右表（改 §13.3/§13.4 的“取费规则”）

- 布局：左树（费用层级） + 右表，不再是扁平列表。
- 左树层级（与表二费用结构一致）：建筑安装工程费 → 直接费 → 人工费 / 材料费 / 机械使用费 / 仪器仪表费 → 措施费 → 规费 → 税金 …；叶子为具体费用项（与 `discount.mjs` 表二行 + `rates.mjs` 费率网格对应）。
- 右表：点树节点 → 显示该组费用项，列：费用名称 / 计算基数 / 费率 / 金额 / 计算式（依据，如“人工费X3%”）。费率可编辑，仍走现有费率行编辑 + `savePatch`。
- 数据模型：不新增费率数据模型；左树由现有表二费用结构派生（`discount.mjs` 表二行定义 + `rates.mjs` 费率网格），右表编辑复用现有费率视图行编辑。
- 左树 + 右表组件：`src/components/FeeTreeTable.jsx`（新增）。

#### 13.11.3 工程信息表单（当前工程 → 工程信息）

完整表单，字段映射（宇翔字段 → 我方）：

| 宇翔字段（P15） | 我方 | 说明 |
|---|---|---|
| 项目编号 | `info.项目编号` | 已有 |
| 工程名称 | `info.建设项目名称` / `单项工程名称` / `单段工程名称` | 已有 3 个字段（分别供封面/表一/表二标题用），表单里分三行清晰呈现，不合并为一个（合并会丢标题区分） |
| 建设单位 | `info.建设单位` | 已有 |
| 施工单位 | `info.施工单位` | **新增，可选字段**，向后兼容（旧数据缺省空） |
| 设计单位 | `info.设计单位` | **新增，可选字段**，向后兼容 |
| 监理单位 | `info.监理单位` | 已有 |
| 编制人 / 审核人 | `info.编制` / `info.审核` | 已有（供封面用）；表单标签写“编制人 / 审核人” |
| 编制日期 | `info.编制日期` | 已有 |
| 工程类别 | `info.工程类型` | 已有；表单标签写“工程类别” |
| 取费标准 | 工程的配置方案（`project.profileId`） | 以“取费标准（配置方案）”下拉呈现，选后切换工程所用方案；不新增字段 |
| 折扣率 | `info.施工折扣` | 已有 |
| 打折选项（单选） | 派生：`施工折扣 = 1` → 不打折，否则打折 | **不新增数据字段**；单选“打折 / 不打折”，选“不打折”置 `施工折扣 = 1`，选“打折”恢复上次折扣率（默认需用户输入） |
| 底部勾选（冬雨季/夜间等） | 不单独设勾选 | 由冬雨季施工费、施工调遣分类、表五启用勾选覆盖（已有） |

- 表单布局：分组（基本信息 / 参建单位 / 编制信息 / 取费与折扣），一次一屏，不堆成一长列。

#### 13.11.4 表五视图（当前工程 → 表五）

- 完整表格，列：费用名称 / 计算基数 / 费率 / 金额 / 公式 / 启用勾选。行覆盖全部表五费用项（不只手动项 + 几个合计行）。
- 公式列：由 `table5Fees` 的 `basis` + `rate` + 取费基数说明生成可读文本；`basis = manual` 显示“手动输入”；安全生产费显示“折前建安工程费除税价 × {rate}%”；其余按各费用项的取费基数说明生成（如“人工费 × {rate}%”）。
- 启用勾选：每行启用/停用，沿用现有 `table5Overrides.enabled` 机制。
- 金额列：由引擎 `result.table5` 取数；手动项金额可覆盖（现有 `table5Overrides.amount`）。

#### 13.11.5 顶栏 / 底栏

- 顶栏（§13.4 基础上补齐）：+ 当前工程名 + 当前方案名 + 保存状态；= 关闭窗口（Electron 现有 `window-all-closed` 行为不变，Mac 下关闭窗口不退出进程）。
- 新建工程：新建工程并打开；打开工程：跳工程列表；保存工程：= （§13.7）；工程管理：跳工程列表。
- 底栏（新增 `src/components/StatusBar.jsx`）：操作提示，随当前视图变化（如工作量：“输定额编号回车下一行”；取费：“点左树切换费用组”；报表导出：“勾选要出的表后点导出”），另显示当前工程/方案/选中行计数。

#### 13.11.6 采用 / 未采用对照

**采用（只学结构与交互）：**
- 侧边栏一次一个功能（宇翔左竖标签模式，§13.4）。
- 工作量五标签（宇翔顶部标签模式，§13.5）。
- 取费左树 + 右表（P13/14/16，§13.11.2）。
- 工程信息完整表单（P15，§13.11.3）。
- 表五：费用名称/计算基数/费率/金额 + 启用勾选 + 公式显示（P17，§13.11.4）。
- 报表预览左树勾选（P12，§13.6 导出勾选）。
- 顶栏工具按钮 + 底栏操作提示（P13–P17，§13.11.5）。
- 工程管理列表（P2，工程列表 + 搜索 + 最近置顶）。

**未采用及原因：**
- 宇翔的图标/图片/文案/配色/品牌插图（P15 右侧 3D 塔图等）：**不抄界面素材**，只学结构交互；品牌插图是宇翔资产。
- 宇翔的文件型工程模型（`.mpq` 工程文件 + `.mqf` 取费文件 + `.mql` 定额库文件，P6 对话框）：不改存储架构；我们用单 JSON 库 + 配置方案（已实现多套配置、整库备份、方案导入/导出），对应功能已覆盖。
- 宇翔的密集多窗格布局（左树 + 右表 + 底栏同时堆叠、字体小）：用户明确要求界面宽松；我们一次只显示一个功能、行高加大、关键数字加大字。
- 宇翔的取费文件对话框（`.mqf` 文件选择，P6）：对应功能由“配置方案”覆盖，不另做文件选择器。
- 右键菜单（P1/P5/P9 的插入/删除/复制/粘贴）：不做；行内操作按钮 + 批量操作已覆盖等价功能，右键菜单增加实现量且与现有交互重复；用户后续要求再加。
- 宇翔特有的提示文案与按钮文字：不抄；标签名用行业通用名（表三甲/表四甲等是行业标准表名，不是宇翔独有）。

#### 13.11.7 对测试的补充（§13.10 基础上加）

- `tests/feeTree.test.mjs`：取费左树由现有表二费用结构派生（层级完整、叶子与费率行一一对应）；点节点切换右表分组。
- `tests/projectInfo.test.mjs`：工程信息新字段（施工单位/设计单位）可选、旧数据缺省空；打折单选派生（`施工折扣 = 1` ↔ 不打折）；取费标准下拉切换工程方案。
- `tests/table5Formula.test.mjs`：表五公式列生成（安全生产费公式含取费基数与费率；手动项显示“手动输入”；启用勾选沿用 `table5Overrides.enabled`）。
