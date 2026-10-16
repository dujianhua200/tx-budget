using TxBudget.Core.Engine;
using TxBudget.Core.Model;
using Xunit;

namespace TxBudget.Core.Tests;

/// <summary>
/// 端口 tests/discount.test.mjs：打折模型口径测试。
/// </summary>
public class DiscountTests : TestBase
{
    private static readonly string[] Q2Keys =
    {
        "carryFee", "disturbFee", "tempFee", "nightFee", "winterFee", "utilityFee",
        "specialFee", "protectFee", "earthFee", "dispatchFee", "bigMachineFee",
    };

    private static readonly Dictionary<string, decimal> RefBefore = new()
    {
        ["techFee"] = 144687.55m, ["laborFee"] = 48230.63m, ["laborTotal"] = 192918.18m,
        ["jiaMat"] = 74246.30m, ["yiMat"] = 0m, ["mainMat"] = 74246.30m, ["auxMat"] = 222.74m, ["matTotal"] = 74469.04m,
        ["machineFee"] = 5580.00m, ["instrumentFee"] = 15455.26m, ["directFee"] = 288422.48m,
        ["envFee"] = 0m, ["civilFee"] = 2893.77m, ["carryFee"] = 6559.22m, ["disturbFee"] = 11575.09m, ["handoverFee"] = 6366.30m,
        ["tempFee"] = 9645.91m, ["vehicleFee"] = 9645.91m, ["nightFee"] = 4822.95m, ["winterFee"] = 3472.53m, ["toolFee"] = 2893.77m,
        ["utilityFee"] = 0m, ["specialFee"] = 0m, ["protectFee"] = 3858.36m, ["earthFee"] = 0m, ["dispatchFee"] = 5916.00m, ["bigMachineFee"] = 0m,
        ["measureFee"] = 67649.81m, ["directTotal"] = 356072.29m,
        ["sewageFee"] = 0m, ["socialFee"] = 54981.68m, ["housingFee"] = 8083.27m, ["accidentFee"] = 1929.18m, ["regFee"] = 64994.13m,
        ["mgmtFee"] = 52859.58m, ["indirectTotal"] = 117853.71m, ["profit"] = 38583.64m, ["exclTax"] = 512509.64m,
        ["outputTax"] = 39443.70m, ["inclTax"] = 551953.34m, ["dispatchUnit"] = 0m, ["dispatchPeople"] = 0m,
    };

    private static readonly Dictionary<string, decimal> RefBeforeNoQ2 = new()
    {
        ["techFee"] = 144687.55m, ["laborFee"] = 48230.63m, ["laborTotal"] = 192918.18m,
        ["jiaMat"] = 74246.30m, ["yiMat"] = 0m, ["mainMat"] = 74246.30m, ["auxMat"] = 222.74m, ["matTotal"] = 74469.04m,
        ["machineFee"] = 5580.00m, ["instrumentFee"] = 15455.26m, ["directFee"] = 288422.48m,
        ["envFee"] = 0m, ["civilFee"] = 2893.77m,
        ["carryFee"] = 0m, ["disturbFee"] = 0m, ["handoverFee"] = 6366.30m,
        ["tempFee"] = 0m, ["vehicleFee"] = 9645.91m, ["nightFee"] = 0m, ["winterFee"] = 0m, ["toolFee"] = 2893.77m,
        ["utilityFee"] = 0m, ["specialFee"] = 0m, ["protectFee"] = 0m, ["earthFee"] = 0m, ["dispatchFee"] = 0m, ["bigMachineFee"] = 0m,
        ["measureFee"] = 21799.75m,
        ["sewageFee"] = 0m, ["socialFee"] = 54981.68m, ["housingFee"] = 8083.27m, ["accidentFee"] = 1929.18m,
        ["mgmtFee"] = 52859.58m, ["profit"] = 38583.64m,
        ["outputTax"] = 0m, ["dispatchUnit"] = 0m, ["dispatchPeople"] = 0m,
    };

    private static readonly Dictionary<string, object> RuleRef = new()
    {
        ["discountRate"] = 0.379m,
        ["noDiscountKeys"] = DiscountEngine.DefaultNoDiscountKeys.ToList(),
        ["outputTaxRate"] = 0.09m,
        ["jiaTax"] = 0m,
    };

    private static void AssertApprox(decimal got, decimal want, string label, decimal tol = 0.011m)
    {
        Assert.True(Math.Abs(got - want) <= tol, $"{label}: got={got} want={want}");
    }

    [Fact]
    public void ApplyDiscount_With_Q2_Zeroed_Before()
    {
        // 把 Q2 键置 0，构建测试输入
        var before = new Dictionary<string, decimal>(RefBeforeNoQ2);
        before["directTotal"] = 288422.48m + 21799.75m; // directFee + measureFee
        before["exclTax"] = 466659.58m;
        before["indirectTotal"] = 64994.13m + 52859.58m; // regFee + mgmtFee
        before["regFee"] = 64994.13m;

        var after = DiscountEngine.ApplyDiscount(before, 0.379m,
            DiscountEngine.DefaultNoDiscountKeys.ToList(),
            DiscountEngine.DefaultZeroAfterDiscountKeys.ToList(),
            0.09m, 0m);

        AssertApprox(after["techFee"], 54836.58m, "折后技工费");
        AssertApprox(after["laborFee"], 18279.41m, "折后普工费");
        AssertApprox(after["laborTotal"], 73115.99m, "折后人工费");
        AssertApprox(after["machineFee"], 2114.82m, "折后机械费");
        AssertApprox(after["instrumentFee"], 5857.54m, "折后仪表费");
        AssertApprox(after["civilFee"], 2893.77m, "折后文明施工费不打折");
        AssertApprox(after["handoverFee"], 2412.83m, "折后点交");
        AssertApprox(after["vehicleFee"], 3655.80m, "折后车辆");
        AssertApprox(after["toolFee"], 1096.74m, "折后工具");
        AssertApprox(after["mainMat"], 74246.30m, "折后主材不打折");
        AssertApprox(after["auxMat"], 222.74m, "折后辅材不打折");
        AssertApprox(after["mgmtFee"], 20033.78m, "折后企管");
        AssertApprox(after["profit"], 14623.20m, "折后利润");
        AssertApprox(after["regFee"], 64994.13m, "折后规费", 0.02m);
        AssertApprox(after["socialFee"], 54981.68m, "折后社保");
        AssertApprox(after["measureFee"], 10059.14m, "折后措施");
        AssertApprox(after["exclTax"], 265267.64m, "折后除税价", 0.02m);
        AssertApprox(after["directFee"], 155557.39m, "合计 = 明细和");
    }

    [Fact]
    public void ApplyDiscount_Full_RefBefore_Q2KeysAllZero()
    {
        var after = DiscountEngine.ApplyDiscount(RefBefore, 0.379m,
            DiscountEngine.DefaultNoDiscountKeys.ToList(),
            DiscountEngine.DefaultZeroAfterDiscountKeys.ToList(),
            0.09m, 0m);
        foreach (var k in Q2Keys)
        {
            Assert.Equal(0m, after[k]);
        }
        AssertApprox(after["measureFee"], 10059.14m, "完整参考折后措施");
        AssertApprox(after["exclTax"], 265267.64m, "完整参考折后除税价", 0.02m);
    }

    [Fact]
    public void ApplyDiscount_DiscountEqualsOne_PreservesAll()
    {
        var after = DiscountEngine.ApplyDiscount(RefBefore, 1m,
            DiscountEngine.DefaultNoDiscountKeys.ToList(),
            DiscountEngine.DefaultZeroAfterDiscountKeys.ToList());
        foreach (var k in new[] { "techFee", "laborFee", "mainMat", "civilFee", "regFee", "measureFee", "exclTax", "outputTax", "dispatchFee", "winterFee", "carryFee", "tempFee" })
        {
            Assert.Equal(RefBefore[k], after[k]);
        }
    }

    [Fact]
    public void ApplyDiscount_InvalidRate_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            DiscountEngine.ApplyDiscount(RefBefore, 0m));
        Assert.Throws<ArgumentException>(() =>
            DiscountEngine.ApplyDiscount(RefBefore, 1.5m));
    }

    [Fact]
    public void ApplyDiscount_CustomNoDiscount_Keys()
    {
        var custom = DiscountEngine.ApplyDiscount(RefBeforeNoQ2, 0.5m,
            DiscountEngine.DefaultNoDiscountKeys.Concat(new[] { "machineFee" }).ToList(),
            DiscountEngine.DefaultZeroAfterDiscountKeys.ToList(),
            0.09m, 0m);
        AssertApprox(custom["techFee"], 72343.78m, "技工费 ×0.5");
        Assert.Equal(5580.00m, custom["machineFee"]);
        Assert.Equal(74246.30m, custom["mainMat"]);
    }

    [Fact]
    public void ApplyDiscount_CustomZeroKeys_List()
    {
        // 清空零值清单，11 项恢复打折
        var noZero = DiscountEngine.ApplyDiscount(RefBefore, 0.379m,
            DiscountEngine.DefaultNoDiscountKeys.ToList(),
            new List<string>(),
            0.09m, 0m);
        AssertApprox(noZero["measureFee"], 27436.31m, "零值清单清空则措施恢复");
        AssertApprox(noZero["carryFee"], 2485.94m, "搬运恢复打折");
        AssertApprox(noZero["disturbFee"], 4386.96m, "干扰恢复打折");
    }

    [Fact]
    public void ApplyDiscount_ZeroKeysPriority_Over_NoDiscount()
    {
        // 同时含 carryFee 时折后=0 优先
        var both = DiscountEngine.ApplyDiscount(RefBefore, 0.379m,
            DiscountEngine.DefaultNoDiscountKeys.Concat(new[] { "carryFee" }).ToList(),
            DiscountEngine.DefaultZeroAfterDiscountKeys.ToList(),
            0.09m, 0m);
        Assert.Equal(0m, both["carryFee"]);
    }

    [Fact]
    public void ApplyDiscount_WithSafetyFee_NotDiscountedByDefault()
    {
        var withSafety = DiscountEngine.ApplyDiscount(
            new Dictionary<string, decimal>(RefBeforeNoQ2) { ["safetyFee"] = 1000m },
            0.379m,
            DiscountEngine.DefaultNoDiscountKeys.ToList(),
            DiscountEngine.DefaultZeroAfterDiscountKeys.ToList(),
            0.09m, 0m);
        Assert.Equal(1000m, withSafety["safetyFee"]);
    }

    [Fact]
    public void ApplyDiscount_WithSafetyFee_DiscountedWhenRemovedFromList()
    {
        var noDiscWithout = DiscountEngine.DefaultNoDiscountKeys.Where(k => k != "safetyFee").ToList();
        var withSafety = DiscountEngine.ApplyDiscount(
            new Dictionary<string, decimal>(RefBeforeNoQ2) { ["safetyFee"] = 1000m },
            0.379m,
            noDiscWithout,
            DiscountEngine.DefaultZeroAfterDiscountKeys.ToList(),
            0.09m, 0m);
        AssertApprox(withSafety["safetyFee"], 379.00m, "safetyFee 移出后打折");
    }

    [Fact]
    public void ApplyDiscount_OutputTax_AfterDiscountBase()
    {
        var after = DiscountEngine.ApplyDiscount(RefBeforeNoQ2, 0.379m,
            DiscountEngine.DefaultNoDiscountKeys.ToList(),
            DiscountEngine.DefaultZeroAfterDiscountKeys.ToList(),
            0.09m, 0.13m);
        // (exclTax - jiaMat) * 0.09 + jiaMat * 0.13 = 26843.94
        AssertApprox(after["outputTax"], 26843.94m, "折后销项税额按折后基数公式");
    }

    [Fact]
    public void SafetyFee_2Percent_Of_PreDiscountExclTax()
    {
        var res = CalcEngine.CalcProject(new Project
        {
            Info = new ProjectInfo
            {
                工程类型 = "通信线路工程",
                施工折扣 = 1m,
                施工距离 = "35KM以内",
                施工调遣分类 = "施工队伍调遣人数(线路、管道）",
                冬雨季施工费 = "Ⅲ类地区",
                甲供增值税 = 0.13m,
                乙供增值税 = 0.09m,
            },
            Quantities = new List<QuantityRow>
            {
                new() { Quota = "TXL1-008", Qty = 7m, Coef = 1m },
            },
        }, LibsWithWinterTable);

        AssertApprox(res.Table5.SafetyFee, res.Table2Before["exclTax"] * 0.02m, "安全生产费 = 折前除税价 × 2%");
        Assert.Equal(0m, res.Table5.SafetyVat);
        Assert.Equal(res.Table5.SafetyFee, res.Table5.SafetyIncl);
        Assert.Equal(16, res.Table5.Rows.Count);
        Assert.Contains(res.Table5.Rows, r => r.Key == "designTotal" && r.Basis == "sum");
        Assert.Equal(res.Table5.SurveyFee + res.Table5.DesignFee, res.Table5.DesignTotal);
        Assert.Equal(res.Table5.Mgmt2 + res.Table5.DesignTotal + res.Table5.SafetyFee, res.Table5.TotalExcl);
    }

    [Fact]
    public void Summary_ConstructionEquals_DiscountedExclTax()
    {
        var res = CalcEngine.CalcProject(new Project
        {
            Info = new ProjectInfo { 工程类型 = "通信线路工程", 施工折扣 = 1m },
            Quantities = new List<QuantityRow>
            {
                new() { Quota = "TXL1-008", Qty = 7m, Coef = 1m },
            },
        }, LibsWithWinterTable);

        Assert.Equal(res.Table1.AfterDiscount, res.Summary.ConstructionExcl);
        Assert.Equal(res.Table2After["exclTax"], res.Summary.ConstructionExcl);
        Assert.Equal(res.Table5.TotalExcl, res.Summary.Other);
        Assert.Equal(res.Summary.ConstructionExcl + res.Summary.Other, res.Summary.TotalExcl);
    }

    [Fact]
    public void Table1_AfterDiscount_Uses_DiscountedItemMode_NotShortcut()
    {
        var res = CalcEngine.CalcProject(new Project
        {
            Info = new ProjectInfo { 工程类型 = "通信线路工程", 施工折扣 = 0.379m },
            Quantities = new List<QuantityRow>
            {
                new() { Quota = "TXL1-008", Qty = 7m, Coef = 1m },
            },
        }, LibsWithWinterTable);

        Assert.Equal(res.Table2After["exclTax"], res.Table1.AfterDiscount);
        Assert.Equal(res.Table2After["outputTax"], res.Table1.TaxAfter);

        // v1 快捷公式：必须不等
        var shortcut = (res.Table2Before["exclTax"] - res.Table2Before["mainMat"] - res.Table2Before["regFee"]) * 0.379m
            + res.Table2Before["mainMat"] + res.Table2Before["regFee"];
        Assert.True(Math.Abs(res.Table1.AfterDiscount - shortcut) > 1m,
            $"表一折后 {res.Table1.AfterDiscount} 不应等于快捷公式 {shortcut}");
    }
}