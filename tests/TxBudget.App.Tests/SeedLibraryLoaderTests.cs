using System.IO;
using TxBudget.Core.Infrastructure;
using Xunit;

namespace TxBudget.App.Tests;

public class SeedLibraryLoaderTests
{
    [Fact]
    public void LoadFromFile_ParsesQuotas()
    {
        var path = Path.Combine("fixtures", "seed.json");
        Assert.True(File.Exists(path), "seed.json fixture 必须存在");
        var json = File.ReadAllText(path);
        var libs = SeedLibraryLoader.LoadFromJson(json);
        Assert.NotNull(libs);
        Assert.NotNull(libs.Quotas);
        Assert.True(libs.Quotas.Count > 0, "应加载至少一条定额");
    }

    [Fact]
    public void LoadFromFile_ParsesMaterials()
    {
        var path = Path.Combine("fixtures", "seed.json");
        var json = File.ReadAllText(path);
        var libs = SeedLibraryLoader.LoadFromJson(json);
        Assert.NotNull(libs.Materials);
        Assert.True(libs.Materials.Count > 0, "应加载至少一条材料");
    }

    [Fact]
    public void LoadFromFile_ParsesRates()
    {
        var path = Path.Combine("fixtures", "seed.json");
        var json = File.ReadAllText(path);
        var libs = SeedLibraryLoader.LoadFromJson(json);
        Assert.NotNull(libs.Rates);
        Assert.NotNull(libs.Rates.ByProjectType);
        Assert.True(libs.Rates.ByProjectType.Count > 0, "应加载至少一个工程类型的费率");
    }

    [Fact]
    public void LoadFromFile_ParsesWinterTable()
    {
        var path = Path.Combine("fixtures", "seed.json");
        var json = File.ReadAllText(path);
        var libs = SeedLibraryLoader.LoadFromJson(json);
        Assert.NotNull(libs.WinterTable);
        Assert.True(libs.WinterTable.Count > 0, "应加载冬雨季表");
    }
}
