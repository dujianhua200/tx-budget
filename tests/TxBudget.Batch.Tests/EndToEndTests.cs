using ClosedXML.Excel;
using TxBudget.Batch.Models;
using TxBudget.Core.Engine;
using TxBudget.Core.Model;
using TxBudget.Export;
using Xunit;

namespace TxBudget.Batch.Tests;

public class EndToEndTests : IDisposable
{
    private readonly string _tempDir;

    public EndToEndTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, true);
    }

    private static LibrarySet CreateEndToEndLibs()
    {
        return new LibrarySet
        {
            Quotas = new List<Quota>
            {
                new() { Code = "TXL3-187", Name = "敷设管道光缆", Unit = "百米条", Tech = 1.20m, Labor = 0.80m },
                new() { Code = "TXL1-008", Name = "开挖路面", Unit = "100m2", Tech = 3.00m, Labor = 5.00m },
            },
            Materials = new List<Material>
            {
                new() { Name = "光缆", Spec = "GYTS_6芯", Unit = "米", PriceExcl = 2.0m, Supply = "甲供" },
            },
            Rules = new List<MaterialRule>
            {
                new() { Id = "r1", Quota = "TXL3-187", Material = "光缆", Spec = "GYTS_6芯", Kind = "变体", Variant = "6芯", Consumption = 1.2084m, Supply = "甲供" },
            },
            MachinePrices = new List<MachinePrice>
            {
                new() { Code = "M001", Name = "空气压缩机", Price = 50m },
            },
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
    public void FullFlow_WorkloadToExport()
    {
        // 1. 创建工作量表 Excel
        var workloadPath = Path.Combine(_tempDir, "workload.xlsx");
        using (var wb = new XLWorkbook())
        {
            var ws = wb.Worksheets.Add("线路工程A");
            ws.Cell(1, 1).Value = "定额编号";
            ws.Cell(1, 2).Value = "名称";
            ws.Cell(1, 3).Value = "工程量";
            ws.Cell(1, 4).Value = "系数";
            ws.Cell(2, 1).Value = "TXL3-187";
            ws.Cell(2, 2).Value = "敷设管道光缆";
            ws.Cell(2, 3).Value = 2m;
            ws.Cell(2, 4).Value = 1m;
            wb.SaveAs(workloadPath);
        }

        // 2. 导入工作量表
        var importer = new WorkloadTableImporter();
        var tables = importer.ImportFromExcel(workloadPath);
        Assert.Single(tables);
        Assert.Equal("线路工程A", tables[0].SheetName);

        // 3. 批量生成项目
        var libs = CreateEndToEndLibs();
        var generator = new BatchProjectGenerator(libs);
        var batchResult = generator.GenerateAll(tables, new ProjectInfo { 工程类型 = "通信线路工程", 施工折扣 = 1m });
        Assert.Equal(1, batchResult.SuccessCount);
        Assert.Equal(0, batchResult.FailCount);

        var calcResult = batchResult.Projects[0].CalcResult;
        Assert.NotNull(calcResult);
        Assert.True(calcResult!.Table2["laborTotal"] > 0);
        Assert.True(calcResult.Table2["exclTax"] > 0);
        Assert.True(calcResult.Table1.GrandIncl > 0);

        // 4. 导出批量结果
        var batchExportPath = Path.Combine(_tempDir, "batch_result.xlsx");
        var batchExporter = new BatchExporter();
        batchExporter.ExportToExcel(batchResult, batchExportPath);
        Assert.True(File.Exists(batchExportPath));

        // 5. 导出项目报表
        var reportPath = Path.Combine(_tempDir, "reports.xlsx");
        var reportExporter = new ExcelProjectExporter();
        reportExporter.ExportAll(reportPath, calcResult);
        Assert.True(File.Exists(reportPath));

        using var reportWb = new XLWorkbook(reportPath);
        Assert.True(reportWb.Worksheets.Count >= 5); // 至少包含主要报表
    }
}
