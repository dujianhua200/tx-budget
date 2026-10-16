using ClosedXML.Excel;
using TxBudget.Core.Engine;
using TxBudget.Core.Model;
using TxBudget.Library;
using Xunit;

namespace TxBudget.Library.Tests;

public class ExcelLibraryExporterTests : IDisposable
{
    private readonly string _tempDir;

    public ExcelLibraryExporterTests()
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
    public void Export_CreatesAllSheets()
    {
        var mgr = new LibraryManager();
        mgr.AddQuota(new Quota { Code = "TXL3-187", Name = "敷设管道光缆", Unit = "百米条", Tech = 1.2m, Labor = 0.8m });
        mgr.AddMaterial(new Material { Name = "光缆", Spec = "GYTS_6芯", Unit = "米", PriceExcl = 2m, Supply = "甲供" });
        mgr.AddMachinePrice(new MachinePrice { Code = "M001", Name = "空压机", Price = 100m });
        mgr.SetRateRow("通信线路工程", new NamedRateRow { TechPrice = 114m, LaborPrice = 61m });

        var path = Path.Combine(_tempDir, "libs.xlsx");
        var exporter = new ExcelLibraryExporter();
        exporter.Export(path, mgr);

        Assert.True(File.Exists(path));
        using var wb = new XLWorkbook(path);
        var sheetNames = wb.Worksheets.Select(ws => ws.Name).ToList();
        Assert.Contains("定额", sheetNames);
        Assert.Contains("材料", sheetNames);
        Assert.Contains("机械价格", sheetNames);
        Assert.Contains("费率", sheetNames);
    }

    [Fact]
    public void Export_RatesSheet_HasCorrectHeaders()
    {
        var mgr = new LibraryManager();
        mgr.SetRateRow("通信线路工程", new NamedRateRow { TechPrice = 114m, LaborPrice = 61m });

        var path = Path.Combine(_tempDir, "rates.xlsx");
        var exporter = new ExcelLibraryExporter();
        exporter.Export(path, mgr);

        using var wb = new XLWorkbook(path);
        var ws = wb.Worksheet("费率");
        Assert.Equal("工程类型", ws.Cell(1, 1).GetValue<string>());
        Assert.Equal("技工费", ws.Cell(1, 2).GetValue<string>());
    }

    [Theory]
    [InlineData("../escape.xlsx")]
    [InlineData("test.txt")]
    [InlineData("")]
    public void Export_InvalidPath_ThrowsArgumentException(string badPath)
    {
        var mgr = new LibraryManager();
        var exporter = new ExcelLibraryExporter();
        Assert.Throws<ArgumentException>(() => exporter.Export(badPath, mgr));
    }
}
