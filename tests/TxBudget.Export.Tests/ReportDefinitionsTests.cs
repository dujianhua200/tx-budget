using TxBudget.Export;
using Xunit;

namespace TxBudget.Export.Tests;

public class ReportDefinitionsTests
{
    [Fact]
    public void AllReports_HasAtLeast22()
    {
        Assert.True(ReportDefinitions.AllReports.Count >= 22);
    }

    [Fact]
    public void GetByKey_Existing_ReturnsDef()
    {
        var def = ReportDefinitions.GetByKey("Table1");
        Assert.NotNull(def);
        Assert.Equal("表一 建设项目总费用", def!.Name);
    }

    [Fact]
    public void GetByKey_Missing_ReturnsNull()
    {
        Assert.Null(ReportDefinitions.GetByKey("NonExistent"));
    }

    [Fact]
    public void ByCategory_FiltersCorrectly()
    {
        var main = ReportDefinitions.ByCategory("主表");
        Assert.True(main.Count >= 9);
        Assert.All(main, r => Assert.Equal("主表", r.Category));
    }
}
