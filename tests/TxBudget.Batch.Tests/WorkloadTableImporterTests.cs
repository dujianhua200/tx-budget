using ClosedXML.Excel;
using TxBudget.Batch;
using Xunit;

namespace TxBudget.Batch.Tests;

public class WorkloadTableImporterTests : IDisposable
{
    private readonly string _tempDir;

    public WorkloadTableImporterTests()
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
    public void ImportFromExcel_SingleSheet_ReadsAllRows()
    {
        var path = Path.Combine(_tempDir, "workload.xlsx");
        using (var wb = new XLWorkbook())
        {
            var ws = wb.Worksheets.Add("Sheet1");
            ws.Cell(1, 1).Value = "定额编号";
            ws.Cell(1, 2).Value = "名称";
            ws.Cell(1, 3).Value = "工程量";
            ws.Cell(1, 4).Value = "系数";
            ws.Cell(2, 1).Value = "TXL3-187";
            ws.Cell(2, 2).Value = "敷设管道光缆";
            ws.Cell(2, 3).Value = 10m;
            ws.Cell(2, 4).Value = 1m;
            ws.Cell(3, 1).Value = "TXL1-008";
            ws.Cell(3, 2).Value = "开挖路面";
            ws.Cell(3, 3).Value = 5m;
            ws.Cell(3, 4).Value = 0.5m;
            wb.SaveAs(path);
        }

        var importer = new WorkloadTableImporter();
        var tables = importer.ImportFromExcel(path);

        Assert.Single(tables);
        Assert.Equal("Sheet1", tables[0].SheetName);
        Assert.Equal(2, tables[0].Rows.Count);
        Assert.Equal("TXL3-187", tables[0].Rows[0].QuotaCode);
        Assert.Equal(10m, tables[0].Rows[0].Quantity);
        Assert.Equal(1m, tables[0].Rows[0].Coefficient);
        Assert.Equal("TXL1-008", tables[0].Rows[1].QuotaCode);
        Assert.Equal(0.5m, tables[0].Rows[1].Coefficient);
    }

    [Fact]
    public void ImportFromExcel_MultipleSheets_ReadsEachSheet()
    {
        var path = Path.Combine(_tempDir, "multi.xlsx");
        using (var wb = new XLWorkbook())
        {
            var ws1 = wb.Worksheets.Add("项目A");
            ws1.Cell(1, 1).Value = "定额编号";
            ws1.Cell(2, 1).Value = "TXL3-187";
            var ws2 = wb.Worksheets.Add("项目B");
            ws2.Cell(1, 1).Value = "定额编号";
            ws2.Cell(2, 1).Value = "TXL1-008";
            wb.SaveAs(path);
        }

        var importer = new WorkloadTableImporter();
        var tables = importer.ImportFromExcel(path);

        Assert.Equal(2, tables.Count);
        Assert.Equal("项目A", tables[0].SheetName);
        Assert.Equal("项目B", tables[1].SheetName);
    }

    [Fact]
    public void ImportFromCsv_ReadsRows()
    {
        var path = Path.Combine(_tempDir, "workload.csv");
        File.WriteAllText(path, "定额编号,名称,工程量,系数\nTXL3-187,敷设,10,1\nTXL1-008,开挖,5,0.5");

        var importer = new WorkloadTableImporter();
        var table = importer.ImportFromCsv(path);

        Assert.Equal("workload", table.SheetName);
        Assert.Equal(2, table.Rows.Count);
        Assert.Equal("TXL3-187", table.Rows[0].QuotaCode);
        Assert.Equal(10m, table.Rows[0].Quantity);
    }

    [Fact]
    public void ImportFromExcel_SkipsEmptyRows()
    {
        var path = Path.Combine(_tempDir, "sparse.xlsx");
        using (var wb = new XLWorkbook())
        {
            var ws = wb.Worksheets.Add("S");
            ws.Cell(1, 1).Value = "定额编号";
            ws.Cell(2, 1).Value = "TXL3-187";
            ws.Cell(3, 1).Value = "";
            ws.Cell(4, 1).Value = "TXL1-008";
            wb.SaveAs(path);
        }

        var importer = new WorkloadTableImporter();
        var tables = importer.ImportFromExcel(path);

        Assert.Equal(2, tables[0].Rows.Count);
    }
}
