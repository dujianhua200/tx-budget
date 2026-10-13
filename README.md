# 通信概预算 App（Electron + React + 纯 JS 引擎）

451号文通信工程概预算桌面应用。核心：**可定制**（定额/材料/费率/关联规则/工程信息全部可改、可导入导出）+
**批量生成工程**（批量新建/导入/导出/改价/改费率）。

## 目录

- `src/engine/calc.mjs` — 计算引擎（纯 JS，无依赖）：表三甲/乙/丙 → 表四甲/乙 → 表二 → 表一/表五/汇总表
- `src/pages/` — 工程列表 / 工程详情（工程量/费用表/材料表/表三/工程信息）/ 批量生成 / 定制设置
- `electron/` — 主进程（窗口、JSON 存储、备份）+ `excel.cjs`（Excel 导入/导出）
- `data/seed.json` — 种子数据（从 v3.0 母版提取：定额 2622、短单 165、材料 175、规则 117、费率矩阵、机械/仪表映射）
- `tests/` — 引擎测试 + LO 交叉验证 + Excel 导入导出测试

## 开发

```bash
npm install
npm test        # 引擎 12 + 交叉验证 29 + Excel 13
npm run dev     # Vite 开发服务器（需另开窗口 npm start）
npm start       # Electron（加载 dist）
npm run pack    # 打包 macOS zip（Linux 下 dmg 需 sips，做 zip）
```

## 验证（2026-10-13）

- 引擎单元测试 12/12（对标 v3.0 母版实测值：变体/变体*/通用/备选、挂钩 10000、工日X0.5、空压机 5.95 台班）。
- LibreOffice 交叉验证 29/29（把同场景填入 v3.0 母版重算，表一/二/三甲乙丙/四甲乙/五/汇总表逐项一致）。
- Excel 导入导出 13/13。Electron 冒烟（xvfb）：窗口加载、React 渲染、IPC 正常。
- 母版 bug 已修正：里程为空 #N/A、测量不全 #VALUE!、冬雨季嵌套公式 #N/A。

## 数据

全部存在 `~/Library/Application Support/通信概预算/budget-data.json`，每次修改自动备份最近 5 份。
首次启动从 `data/seed.json` 载入默认库；定额库由用户自己在 Excel 中维护后导入（合并/替换）。
