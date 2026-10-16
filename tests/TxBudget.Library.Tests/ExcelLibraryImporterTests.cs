using ClosedXML.Excel;
using TxBudget.Core.Model;
using TxBudget.Library;
using Xunit;

namespace TxBudget.Library.Tests;

public class ExcelLibraryImporterTests : IDisposable
{
    private readonly string _tempDir;

    public ExcelLibraryImporterTests()
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
    public void Import_MergeMode_AddsNewItems()
    {
        var path = Path.Combine(_tempDir, "import.xlsx");
        using (var wb = new XLWorkbook())
        {
            var ws = wb.Worksheets.Add("定额");
            ws.Cell(1, 1).Value = "Code";
            ws.Cell(1, 2).Value = "Name";
            ws.Cell(1, 3).Value = "Unit";
            ws.Cell(2, 1).Value = "TXL3-187";
            ws.Cell(2, 2).Value = "敷设管道光缆";
            ws.Cell(2, 3).Value = "百米条";
            wb.SaveAs(path);
        }

        var mgr = new LibraryManager();
        var importer = new ExcelLibraryImporter();
        importer.Import(path, mgr, ExcelLibraryImporter.ImportMode.Merge);

        Assert.Single(mgr.Quotas);
        Assert.Equal("TXL3-187", mgr.Quotas[0].Code);
    }

    [Fact]
    public void Import_MergeMode_SkipsExisting()
    {
        var path = Path.Combine(_tempDir, "import2.xlsx");
        using (var wb = new XLWorkbook())
        {
            var ws = wb.Worksheets.Add("定额");
            ws.Cell(1, 1).Value = "Code";
            ws.Cell(1, 2).Value = "Name";
            ws.Cell(2, 1).Value = "TXL3-187";
            ws.Cell(2, 2).Value = "敷设管道光缆";
            wb.SaveAs(path);
        }

        var mgr = new LibraryManager();
        mgr.AddQuota(new Quota { Code = "TXL3-187", Name = "Existing" });
        var importer = new ExcelLibraryImporter();
        importer.Import(path, mgr, ExcelLibraryImporter.ImportMode.Merge);

        Assert.Single(mgr.Quotas);
        Assert.Equal("Existing", mgr.Quotas[0].Name); // 保留原有
    }

    [Fact]
    public void Import_ReplaceMode_ReplacesAll()
    {
        var path = Path.Combine(_tempDir, "import3.xlsx");
        using (var wb = new XLWorkbook())
        {
            var ws = wb.Worksheets.Add("定额");
            ws.Cell(1, 1).Value = "Code";
            ws.Cell(1, 2).Value = "Name";
            ws.Cell(2, 1).Value = "TXL3-187";
            ws.Cell(2, 2).Value = "NewName";
            wb.SaveAs(path);
        }

        var mgr = new LibraryManager();
        mgr.AddQuota(new Quota { Code = "OLD", Name = "OldName" });
        var importer = new ExcelLibraryImporter();
        importer.Import(path, mgr, ExcelLibraryImporter.ImportMode.Replace);

        Assert.Single(mgr.Quotas);
        Assert.Equal("TXL3-187", mgr.Quotas[0].Code);
    }

    [Fact]
    public void Import_Materials_ReadsCorrectly()
    {
        var path = Path.Combine(_tempDir, "import_mat.xlsx");
        using (var wb = new XLWorkbook())
        {
            var ws = wb.Worksheets.Add("材料");
            ws.Cell(1, 1).Value = "Name";
            ws.Cell(1, 2).Value = "Spec";
            ws.Cell(1, 3).Value = "Unit";
            ws.Cell(1, 4).Value = "PriceExcl";
            ws.Cell(1, 5).Value = "Supply";
            ws.Cell(2, 1).Value = "光缆";
            ws.Cell(2, 2).Value = "GYTS_6芯";
            ws.Cell(2, 3).Value = "米";
            ws.Cell(2, 4).Value = 2.5m;
            ws.Cell(2, 5).Value = "甲供";
            wb.SaveAs(path);
        }

        var mgr = new LibraryManager();
        var importer = new ExcelLibraryImporter();
        importer.Import(path, mgr, ExcelLibraryImporter.ImportMode.Merge);

        Assert.Single(mgr.Materials);
        Assert.Equal("光缆", mgr.Materials[0].Name);
        Assert.Equal(2.5m, mgr.Materials[0].PriceExcl);
        Assert.Equal("甲供", mgr.Materials[0].Supply);
    }

    [Theory]
    [InlineData("../escape.xlsx")]
    [InlineData("test.txt")]
    [InlineData("")]
    public void Import_InvalidPath_ThrowsArgumentException(string badPath)
    {
        var mgr = new LibraryManager();
        var importer = new ExcelLibraryImporter();
        Assert.Throws<ArgumentException>(() => importer.Import(badPath, mgr));
    }
}
