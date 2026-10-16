using ClosedXML.Excel;
using TxBudget.Batch.Models;
using TxBudget.Core.Engine;
using Xunit;

namespace TxBudget.Batch.Tests;

public class BatchExporterTests : IDisposable
{
    private readonly string _tempDir;

    public BatchExporterTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, true);
    }

    [Fact]
    public void ExportToExcel_CreatesFileWithSummary()
    {
        var result = new BatchGenerateResult
        {
            Projects = new List<BatchProjectResult>
            {
                new()
                {
                    ProjectName = "项目A",
                    Success = true,
                    CalcResult = new CalcResult
                    {
                        Info = new Core.Model.ProjectInfo { 工程类型 = "通信线路工程" },
                        Table1 = new Table1Result { GrandExcl = 1000m, GrandVat = 90m, GrandIncl = 1090m },
                        Table2After = new Dictionary<string, decimal> { ["exclTax"] = 1000m, ["inclTax"] = 1090m },
                    },
                    Warnings = new List<string>(),
                }
            }
        };

        var path = Path.Combine(_tempDir, "batch.xlsx");
        var exporter = new BatchExporter();
        exporter.ExportToExcel(result, path);

        Assert.True(File.Exists(path));
        using var wb = new XLWorkbook(path);
        Assert.True(wb.Worksheets.Any(ws => ws.Name == "汇总"));
    }

    [Fact]
    public void ExportToExcel_FailedProject_IncludesErrorInSummary()
    {
        var result = new BatchGenerateResult
        {
            Projects = new List<BatchProjectResult>
            {
                new() { ProjectName = "项目B", Success = false, ErrorMessage = "计算异常" }
            }
        };

        var path = Path.Combine(_tempDir, "batch2.xlsx");
        var exporter = new BatchExporter();
        exporter.ExportToExcel(result, path);

        using var wb = new XLWorkbook(path);
        var summary = wb.Worksheet("汇总");
        var statusCell = summary.Cell(2, 5).GetValue<string>();
        Assert.Contains("失败", statusCell);
    }
}
