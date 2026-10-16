# 通信概预算 v4.0（.NET 8 + Avalonia UI）

451号文通信工程概预算桌面应用。

## 技术栈

- **.NET 8** — 跨平台运行时
- **Avalonia UI** — 跨平台原生桌面框架（macOS + Windows），替代 Electron/嵌入式 webview
- **C# 计算引擎** — 从 v3 纯 JS 引擎完整移植，Oracle 对拍验证
- **ClosedXML 0.102.3** — Excel 导入/导出
- **xUnit** — 单元测试

## 模块结构

| 项目 | 说明 | 目标框架 |
|------|------|----------|
| `src/TxBudget.Core` | 计算引擎（CalcEngine / DiscountEngine / RateResolver / 数据模型） | `net8.0` |
| `src/TxBudget.Batch` | 批量工程生成、工作量表导入 | `net8.0` |
| `src/TxBudget.Export` | 概预算表 Excel 导出（~22 种报表） | `net8.0` |
| `src/TxBudget.Library` | 定额库/材料库/机械库/费率模板 CRUD | `net8.0` |
| `src/TxBudget.App` | **WPF 占位**（待迁移至 Avalonia） | `net8.0-windows` |
| `src/TxBudget.App.Workbench` | **WPF 占位**（待迁移至 Avalonia） | `net8.0-windows` |

## 关键特性

- **双表二**：同时保留折扣前和折扣后表二，安全生产费按折扣前数据计算
- **折扣模型 v2**：11 项措施费折扣后归零；主材/辅材/赔补费/注册费/安全生产费不参与折扣
- **跨平台**：macOS（Apple Silicon arm64，主要平台）+ Windows（x64）
- **无签名分发**：macOS 走未签名 `.app`，首次运行需在「系统设置 → 隐私与安全性 → 仍要打开」

## 构建

```bash
# 还原并构建全部跨平台模块
dotnet restore TxBudget.sln
dotnet build src/TxBudget.Core/TxBudget.Core.csproj -c Release

# 运行全部测试
dotnet test tests/TxBudget.Core.Tests/TxBudget.Core.Tests.csproj -c Release
dotnet test tests/TxBudget.Batch.Tests/TxBudget.Batch.Tests.csproj -c Release
dotnet test tests/TxBudget.Export.Tests/TxBudget.Export.Tests.csproj -c Release
dotnet test tests/TxBudget.Library.Tests/TxBudget.Library.Tests.csproj -c Release
```

## 测试状态（2026-10-17）

- **TxBudget.Core.Tests**：17/17 通过，Oracle 对拍误差 ≤0.011
- **TxBudget.Batch.Tests**：12/12 通过
- **TxBudget.Export.Tests**：13/13 通过
- **TxBudget.Library.Tests**：22/22 通过
- **WPF 占位应用**：仅 Windows 编译验证通过，待 Avalonia 迁移

## 分支

- `main` — v3.x（Electron + React + JS 引擎）
- `v4-avalonia` — v4.0 当前开发分支（.NET 8 + Avalonia UI）
