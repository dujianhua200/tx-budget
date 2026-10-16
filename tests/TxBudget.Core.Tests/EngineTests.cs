using TxBudget.Core.Engine;
using Xunit;

namespace TxBudget.Core.Tests;

/// <summary>
/// 端口 tests/engine.test.mjs：对标 v3.0 母版 LibreOffice 实测值。
/// </summary>
public class EngineTests : TestBase
{
    [Fact]
    public void Scenario_A_MaterialQty_And_Total()
    {
        var variantOf = (string quota, string kind) =>
            Libs.Rules!.Where(r => r.Quota == quota && r.Kind == kind).Select(r => r.Variant ?? "").ToList();
        var v187 = variantOf("TXL3-187", "变体");
        var v7023 = variantOf("TXL7-023", "变体");
        var t7_043 = Libs.Rules!.First(r => r.Quota == "TXL7-043" && r.Kind == "变体").Variant;

        var quantities = new List<Model.QuantityRow>
        {
            new() { Quota = "TXL3-187", Variant = v187.FirstOrDefault(v => v?.EndsWith("6芯") == true), Qty = 2m, Coef = 1m },
            new() { Quota = "TXL3-187", Variant = v187.FirstOrDefault(v => v?.EndsWith("24芯") == true), Qty = 3m, Coef = 1m },
            new() { Quota = "TXL4-053", Variant = "架设吊线式墙壁光缆 6芯(工日X0.5)", Qty = 4m, Coef = 0.5m },
            new() { Quota = "TXL7-023", Variant = v7023[0], Qty = 5m, Coef = 1m },
            new() { Quota = "TXL7-023", Variant = v7023[4], Qty = 1m, Coef = 1m },
            new() { Quota = "TXL7-043", Variant = t7_043, Qty = 2m, Coef = 1m },
        };

        var res = CalcEngine.CalcProject(new Model.Project
        {
            Info = new Model.ProjectInfo { 工程类型 = "通信线路工程", 施工折扣 = 1m },
            Quantities = quantities,
        }, Libs);

        decimal MatQty(string name, string spec)
        {
            foreach (var t in new[] { res.Table4A, res.Table4B, res.Table4Equip })
            {
                var row = t.Rows.FirstOrDefault(r => r.Name == name && r.Spec == spec);
                if (row != null) return row.Qty;
            }
            return 0m;
        }

        Assert.True(Math.Abs(MatQty("光缆", "GYTS_6芯") - 2.4168m) < 0.011m, $"GYTS_6芯 got={MatQty("光缆","GYTS_6芯")}");
        Assert.True(Math.Abs(MatQty("光缆", "GYTS_24芯") - 3.021m) < 0.011m, $"GYTS_24芯 got={MatQty("光缆","GYTS_24芯")}");
        Assert.Equal(0m, MatQty("光缆", "GYTS_12芯"));
        Assert.Equal(5m, MatQty("抱杆2槽（SMC）", ""));
        Assert.Equal(0m, MatQty("抱杆4槽（SMC）", ""));
        Assert.Equal(1m, MatQty("48芯分纤箱（SMC）", ""));
        Assert.Equal(2m, MatQty("光缆交接箱", "288芯"));
        Assert.Equal(0m, MatQty("光缆交接箱", "144芯"));
    }

    [Fact]
    public void Scenario_B_EmptyProject()
    {
        var res = CalcEngine.CalcProject(new Model.Project
        {
            Info = new Model.ProjectInfo(),
            Quantities = new List<Model.QuantityRow>(),
        }, Libs);
        Assert.Equal(0m, res.Table2["exclTax"]);
        Assert.Equal(0m, res.Table1.GrandIncl);
    }

    [Fact]
    public void Scenario_C_Machinery_For_TXL1_008()
    {
        var res = CalcEngine.CalcProject(new Model.Project
        {
            Info = new Model.ProjectInfo(),
            Quantities = new List<Model.QuantityRow>
            {
                new() { Quota = "TXL1-008", Qty = 7m, Coef = 1m },
            },
        }, Libs);
        var air = res.Table3B.Rows.FirstOrDefault(r => r.EquipName?.Contains("空气压缩机") == true);
        Assert.NotNull(air);
        Assert.True(Math.Abs(air!.Sessions - 5.95m) < 0.011m, $"空气压缩机台班 got={air.Sessions}");
        var cutter = res.Table3B.Rows.FirstOrDefault(r => r.EquipName?.Contains("切割机") == true);
        Assert.NotNull(cutter);
        Assert.True(Math.Abs(cutter!.Sessions - 3.5m) < 0.011m, $"路面切割机台班 got={cutter.Sessions}");
    }
}