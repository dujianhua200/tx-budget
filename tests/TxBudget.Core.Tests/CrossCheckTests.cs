using TxBudget.Core.Engine;
using TxBudget.Core.Model;
using Xunit;

namespace TxBudget.Core.Tests;

/// <summary>
/// 端口 tests/crosscheck.test.mjs：与 LibreOffice 真实重算夹具（lo_values.json）比对。
/// </summary>
public class CrossCheckTests : TestBase
{
    private Project BuildProject()
    {
        var variantOf = (string quota, string kind) =>
            Libs.Rules!.Where(r => r.Quota == quota && r.Kind == kind).Select(r => r.Variant ?? "").ToList();
        var v187 = variantOf("TXL3-187", "变体");
        var v7023 = variantOf("TXL7-023", "变体");
        var t7_043 = Libs.Rules!.First(r => r.Quota == "TXL7-043" && r.Kind == "变体").Variant;

        return new Project
        {
            Info = new ProjectInfo
            {
                工程类型 = "通信线路工程",
                施工折扣 = 1m,
                施工实际里程 = 36m,
                冬雨季施工费 = "Ⅲ类地区",
                乙供增值税 = 0.09m,
                甲供增值税 = 0.13m,
            },
            Quantities = new List<QuantityRow>
            {
                new() { Quota = "TXL1-002", Variant = "光(电)缆工程施工测量 架空", Qty = 10m, Coef = 1m },
                new() { Quota = "TXL3-187", Variant = v187.FirstOrDefault(v => v?.EndsWith("6芯") == true), Qty = 2m, Coef = 1m },
                new() { Quota = "TXL3-187", Variant = v187.FirstOrDefault(v => v?.EndsWith("24芯") == true), Qty = 3m, Coef = 1m },
                new() { Quota = "TXL4-053", Variant = "架设吊线式墙壁光缆 6芯(工日X0.5)", Qty = 4m, Coef = 0.5m },
                new() { Quota = "TXL7-023", Variant = v7023[0], Qty = 5m, Coef = 1m },
                new() { Quota = "TXL7-023", Variant = v7023[4], Qty = 1m, Coef = 1m },
                new() { Quota = "TXL7-043", Variant = t7_043, Qty = 2m, Coef = 1m },
            },
        };
    }

    private decimal Lo(string key) => LoValues.TryGetValue(key, out var v) ? v : 0m;

    [Fact]
    public void CrossCheck_Vs_LibreOffice()
    {
        var res = CalcEngine.CalcProject(BuildProject(), LibsWithWinterTable);

        // LO 表二 I8 在 LO 下为 #N/A；按母版本意用 0.018 计算
        var laborTotal = res.Table2["laborTotal"];
        var loFixed = new Dictionary<string, decimal>(LoValues)
        {
            ["表二!I8"] = Math.Round(laborTotal * 0.018m, 2),
        };

        void AssertApprox(string label, decimal got, decimal want, decimal tol = 0.011m)
        {
            Assert.True(Math.Abs(got - want) <= tol, $"{label}: engine={got} LO={want}");
        }

        AssertApprox("表三甲 H66(技工小计)", res.TechSub, loFixed["表三甲!H66"]);
        AssertApprox("表三甲 I66(普工小计)", res.LaborSub, loFixed["表三甲!I66"]);
        AssertApprox("表三甲 H68(技工合计)", res.TechDays, loFixed["表三甲!H68"]);
        AssertApprox("表三甲 I68(普工合计)", res.LaborDays, loFixed["表三甲!I68"]);
        AssertApprox("表三乙 J52(机械费)", res.Table3B.Total, loFixed["表三乙!J52"]);
        AssertApprox("表三丙 J57(仪表费)", res.Table3C.Total, loFixed["表三丙!J57"]);
        AssertApprox("表四甲 I63(甲供除税)", res.Table4A.TotalExcl, loFixed["表四甲（主材）!I63"]);
        AssertApprox("表四甲 J63(甲供增值税)", res.Table4A.TotalVat, loFixed["表四甲（主材）!J63"]);
        AssertApprox("表四乙 I63(乙供除税)", res.Table4B.TotalExcl, loFixed["表四乙(乙供）!I63"]);
        AssertApprox("表二 D9(人工费)", res.Table2["laborTotal"], loFixed["表二!D9"]);
        AssertApprox("表二 D13(主材费)", res.Table2["mainMat"], loFixed["表二!D13"]);
        AssertApprox("表二 D16(辅材费)", res.Table2["auxMat"], loFixed["表二!D16"]);
        AssertApprox("表二 D17(机械费)", res.Table2["machineFee"], loFixed["表二!D17"]);
        AssertApprox("表二 D18(仪表费)", res.Table2["instrumentFee"], loFixed["表二!D18"]);
        AssertApprox("表二 I14(调遣费)", res.Table2["dispatchFee"], 1410m);
        AssertApprox("表二 I8(冬雨季)", res.Table2["winterFee"], loFixed["表二!I8"]);
        AssertApprox("表二 I16(间接费)", res.Table2["indirectTotal"], loFixed["表二!I16"]);
        AssertApprox("表二 I23(利润)", res.Table2["profit"], loFixed["表二!I23"]);
        AssertApprox("表二 I24(销项税)", res.Table2["outputTax"], loFixed["表二!I24"]);
        AssertApprox("表二 D6(除税价)", res.Table2["exclTax"], loFixed["表二!D6"]);
        AssertApprox("表二 D5(含税价)", res.Table2["inclTax"], loFixed["表二!D5"]);
        AssertApprox("表一 G6(折前)", res.Table1.BeforeDiscount, loFixed["表一!G6"]);
        AssertApprox("表一 G7(折后)", res.Table1.AfterDiscount, loFixed["表一!G7"]);

        // 增量 6 修正：合计含表五总计（安全 1.5%→2% 差额）
        AssertApprox("表一 J9(合计除税，新口径)",
            res.Table1.SumExcl,
            loFixed["表一!J9"] + loFixed["表二!D6"] * 0.005m);

        AssertApprox("表一 L9(合计含税，新口径)",
            res.Table1.SumIncl,
            loFixed["表一!L9"] + loFixed["表四甲（主材）!J63"]
            + loFixed["表二!D6"] * 0.005m - loFixed["表二!D6"] * 0.015m * 0.09m);

        AssertApprox("表一 L12(总计含税，新口径)",
            res.Table1.GrandIncl,
            loFixed["表一!L12"] + loFixed["表四甲（主材）!J63"]
            + loFixed["表二!D6"] * 0.005m - loFixed["表二!D6"] * 0.015m * 0.09m);

        AssertApprox("表五 D23(其他费除税，新口径)",
            res.Table5.TotalExcl,
            loFixed["表五!D23"] + loFixed["表二!D6"] * 0.005m);

        AssertApprox("表五 E23(其他费增值税，新口径)",
            res.Table5.TotalVat,
            loFixed["表五!E23"] - loFixed["表二!D6"] * 0.015m * 0.09m);

        // 汇总表口径
        AssertApprox("汇总表 L11(总计含税，新口径)",
            res.Summary.TotalIncl,
            loFixed["表二!D6"] + (loFixed["表五!D23"] + loFixed["表二!D6"] * 0.005m)
            + loFixed["表二!I24"] + (loFixed["表五!E23"] - loFixed["表二!D6"] * 0.015m * 0.09m));
    }
}