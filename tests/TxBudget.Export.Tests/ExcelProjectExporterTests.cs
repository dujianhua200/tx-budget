using ClosedXML.Excel;
using TxBudget.Core.Engine;
using TxBudget.Core.Model;
using Xunit;

namespace TxBudget.Export.Tests;

public class ExcelProjectExporterTests : IDisposable
{
    private readonly string _tempDir;

    public ExcelProjectExporterTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, true);
    }

    private static CalcResult CreateMockResult()
    {
        return new CalcResult
        {
            Info = new ProjectInfo { 工程类型 = "通信线路工程", 建设单位 = "TestCorp", 施工折扣 = 1m },
            Rate = new Dictionary<string, decimal> { ["techPrice"] = 114m, ["laborPrice"] = 61m },
            Table2Before = new Dictionary<string, decimal> { ["exclTax"] = 1000m, ["inclTax"] = 1090m },
            Table2After = new Dictionary<string, decimal> { ["exclTax"] = 1000m, ["inclTax"] = 1090m, ["techFee"] = 500m, ["laborFee"] = 200m, ["laborTotal"] = 700m },
            Table3A = new List<Table3ARow>
            {
                new() { Code = "TXL3-187", Name = "敷设管道光缆", Unit = "百米条", Qty = 10m, Tech = 12m, Labor = 8m }
            },
            Table4A = new TableMatResult
            {
                Rows = new List<TableMatRow>
                {
                    new() { Name = "光缆", Spec = "GYTS_6芯", Unit = "米", Qty = 100m, PriceExcl = 2m, AmtExcl = 200m }
                }
            },
            Table1 = new Table1Result { SumExcl = 1000m, SumVat = 90m, SumIncl = 1090m, GrandExcl = 1000m, GrandVat = 90m, GrandIncl = 1090m },
            Summary = new SummaryResult { ConstructionExcl = 1000m, ConstructionVat = 90m, ConstructionIncl = 1090m, TotalExcl = 1000m, TotalVat = 90m, TotalIncl = 1090m },
            Warnings = new List<CalcWarning>(),
        };
    }

    [Fact]
    public void Export_SingleReport_CreatesFile()
    {
        var result = CreateMockResult();
        var path = Path.Combine(_tempDir, "export.xlsx");
        var exporter = new ExcelProjectExporter();
        exporter.Export(path, result, new[] { "Table1" });

        Assert.True(File.Exists(path));
        using var wb = new XLWorkbook(path);
        Assert.Single(wb.Worksheets);
    }

    [Fact]
    public void Export_MultipleReports_CreatesMultipleSheets()
    {
        var result = CreateMockResult();
        var path = Path.Combine(_tempDir, "multi.xlsx");
        var exporter = new ExcelProjectExporter();
        exporter.Export(path, result, new[] { "Table1", "Table2", "Table3A" });

        using var wb = new XLWorkbook(path);
        Assert.Equal(3, wb.Worksheets.Count);
    }

    [Fact]
    public void ExportAll_CreatesAllSheets()
    {
        var result = CreateMockResult();
        var path = Path.Combine(_tempDir, "all.xlsx");
        var exporter = new ExcelProjectExporter();
        exporter.ExportAll(path, result);

        using var wb = new XLWorkbook(path);
        Assert.True(wb.Worksheets.Count >= 22);
    }

    [Fact]
    public void Export_Table1_HasCorrectValues()
    {
        var result = CreateMockResult();
        var path = Path.Combine(_tempDir, "t1.xlsx");
        var exporter = new ExcelProjectExporter();
        exporter.Export(path, result, new[] { "Table1" });

        using var wb = new XLWorkbook(path);
        var ws = wb.Worksheets.First();
        // 表一应包含建安工程费行
        var found = false;
        foreach (var row in ws.RowsUsed())
        {
            if (row.Cell(1).GetValue<string>()?.Contains("建安") == true)
            {
                found = true;
                break;
            }
        }
        Assert.True(found);
    }
}
