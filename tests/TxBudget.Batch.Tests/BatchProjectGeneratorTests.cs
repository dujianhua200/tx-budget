using TxBudget.Batch.Models;
using TxBudget.Core.Engine;
using TxBudget.Core.Model;
using Xunit;

namespace TxBudget.Batch.Tests;

public class BatchProjectGeneratorTests
{
    private static LibrarySet CreateMinimalLibs()
    {
        return new LibrarySet
        {
            Quotas = new List<Quota>
            {
                new() { Code = "TXL3-187", Name = "敷设管道光缆", Unit = "百米条", Tech = 1.2m, Labor = 0.8m },
                new() { Code = "TXL1-008", Name = "开挖路面", Unit = "100m2", Tech = 3.0m, Labor = 5.0m },
            },
            Materials = new List<Material>(),
            Rules = new List<MaterialRule>(),
            MachinePrices = new List<MachinePrice>(),
            InstrumentPrices = new List<MachinePrice>(),
            QuotaMachines = new List<QuotaMachine>(),
            QuotaInstruments = new List<QuotaMachine>(),
            Rates = new RatesBlob
            {
                ByProjectType = new()
                {
                    ["通信线路工程"] = new NamedRateRow
                    {
                        TechPrice = 114m, LaborPrice = 61m, AuxRate = 0.03m,
                        EnvRate = 0.015m, CivilRate = 0.025m, CarryRate = 0.035m,
                        DisturbRate = 0.01m, HandoverRate = 0.015m,
                        TempNearRate = 0.045m, TempFarRate = 0.095m,
                        VehicleRate = 0.025m, NightRate = 0.04m,
                        ToolRate = 0.02m, UtilityRate = 0.015m, ProtectRate = 0.015m,
                        SocialRate = 0.28m, HousingRate = 0.12m, AccidentRate = 0.01m,
                        MgmtRate = 0.27m, ProfitRate = 0.20m,
                    }
                }
            },
            WinterTable = new Dictionary<string, decimal> { ["Ⅲ类地区"] = 0.06m },
            DiscountRule = new DiscountRule { DiscountRate = 1m },
            Table5Fees = Table5Config.DefaultFees(),
            Dispatch = Dispatch.Default(),
        };
    }

    [Fact]
    public void Generate_SingleRow_ReturnsCalcResult()
    {
        var libs = CreateMinimalLibs();
        var gen = new BatchProjectGenerator(libs);
        var table = new WorkloadTable
        {
            SheetName = "Test",
            Rows = new List<WorkloadRow>
            {
                new() { QuotaCode = "TXL3-187", Quantity = 10m, Coefficient = 1m }
            }
        };

        var result = gen.Generate(table);

        Assert.True(result.Success);
        Assert.NotNull(result.CalcResult);
        Assert.True(result.CalcResult!.Table2["laborTotal"] > 0);
    }

    [Fact]
    public void Generate_WithProjectType_UsesCorrectRates()
    {
        var libs = CreateMinimalLibs();
        var gen = new BatchProjectGenerator(libs);
        var table = new WorkloadTable
        {
            ProjectType = "通信线路工程",
            Rows = new List<WorkloadRow>
            {
                new() { QuotaCode = "TXL3-187", Quantity = 10m, Coefficient = 1m }
            }
        };

        var result = gen.Generate(table);

        Assert.True(result.Success);
        Assert.NotNull(result.CalcResult);
        Assert.Equal("通信线路工程", result.CalcResult!.Info?.工程类型);
    }

    [Fact]
    public void Generate_WithTemplateInfo_MergesDefaults()
    {
        var libs = CreateMinimalLibs();
        var gen = new BatchProjectGenerator(libs);
        var table = new WorkloadTable
        {
            Rows = new List<WorkloadRow>
            {
                new() { QuotaCode = "TXL3-187", Quantity = 1m, Coefficient = 1m }
            }
        };
        var template = new ProjectInfo { 建设单位 = "TestCorp", 施工折扣 = 0.9m };

        var result = gen.Generate(table, template);

        Assert.True(result.Success);
        Assert.Equal("TestCorp", result.Project?.Info?.建设单位);
        Assert.Equal(0.9m, result.Project?.Info?.施工折扣);
    }

    [Fact]
    public void Generate_UnknownQuota_WarnsButSucceeds()
    {
        var libs = CreateMinimalLibs();
        var gen = new BatchProjectGenerator(libs);
        var table = new WorkloadTable
        {
            Rows = new List<WorkloadRow>
            {
                new() { QuotaCode = "UNKNOWN-001", Quantity = 1m, Coefficient = 1m }
            }
        };

        var result = gen.Generate(table);

        Assert.True(result.Success);
        Assert.Contains(result.Warnings, w => w.Contains("UNKNOWN-001"));
    }

    [Fact]
    public void GenerateAll_MultipleTables_ReturnsAllResults()
    {
        var libs = CreateMinimalLibs();
        var gen = new BatchProjectGenerator(libs);
        var tables = new List<WorkloadTable>
        {
            new() { SheetName = "A", Rows = new() { new() { QuotaCode = "TXL3-187", Quantity = 1m } } },
            new() { SheetName = "B", Rows = new() { new() { QuotaCode = "TXL1-008", Quantity = 1m } } },
        };

        var result = gen.GenerateAll(tables);

        Assert.Equal(2, result.Projects.Count);
        Assert.Equal(2, result.SuccessCount);
        Assert.Equal(0, result.FailCount);
    }

    [Fact]
    public void GenerateAll_LargeBatch_ParallelProducesAllResults()
    {
        var libs = CreateMinimalLibs();
        var gen = new BatchProjectGenerator(libs);
        var tables = new List<WorkloadTable>();
        for (int i = 0; i < 120; i++)
        {
            tables.Add(new WorkloadTable
            {
                SheetName = $"Project{i}",
                Rows = new() { new() { QuotaCode = "TXL3-187", Quantity = 1m } }
            });
        }

        var result = gen.GenerateAll(tables);

        Assert.Equal(120, result.Projects.Count);
        Assert.Equal(120, result.SuccessCount);
        Assert.Equal(0, result.FailCount);
        // 验证顺序：结果应按输入顺序排列
        for (int i = 0; i < 120; i++)
        {
            Assert.Equal($"Project{i}", result.Projects[i].ProjectName);
        }
    }
}
