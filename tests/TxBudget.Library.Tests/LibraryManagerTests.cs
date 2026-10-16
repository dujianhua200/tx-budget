using TxBudget.Core.Model;
using TxBudget.Library;
using Xunit;

namespace TxBudget.Library.Tests;

public class LibraryManagerTests
{
    [Fact]
    public void AddQuota_IncreasesCount()
    {
        var mgr = new LibraryManager();
        mgr.AddQuota(new Quota { Code = "TXL3-187", Name = "Test" });
        Assert.Single(mgr.Quotas);
        Assert.Equal("TXL3-187", mgr.Quotas[0].Code);
    }

    [Fact]
    public void FindQuota_Existing_ReturnsItem()
    {
        var mgr = new LibraryManager();
        mgr.AddQuota(new Quota { Code = "TXL3-187", Name = "Test" });
        var found = mgr.FindQuota("TXL3-187");
        Assert.NotNull(found);
    }

    [Fact]
    public void FindQuota_Missing_ReturnsNull()
    {
        var mgr = new LibraryManager();
        Assert.Null(mgr.FindQuota("NONE"));
    }

    [Fact]
    public void RemoveQuota_Existing_Removes()
    {
        var mgr = new LibraryManager();
        mgr.AddQuota(new Quota { Code = "TXL3-187", Name = "Test" });
        Assert.True(mgr.RemoveQuota("TXL3-187"));
        Assert.Empty(mgr.Quotas);
    }

    [Fact]
    public void UpdateQuota_ModifiesFields()
    {
        var mgr = new LibraryManager();
        mgr.AddQuota(new Quota { Code = "TXL3-187", Name = "Old", Unit = "m" });
        mgr.UpdateQuota(new Quota { Code = "TXL3-187", Name = "New", Unit = "km" });
        Assert.Equal("New", mgr.FindQuota("TXL3-187")!.Name);
        Assert.Equal("km", mgr.FindQuota("TXL3-187")!.Unit);
    }

    [Fact]
    public void AddMaterial_AndFind()
    {
        var mgr = new LibraryManager();
        mgr.AddMaterial(new Material { Name = "光缆", Spec = "GYTS_6芯", PriceExcl = 2m });
        Assert.Single(mgr.Materials);
        var found = mgr.FindMaterial("光缆", "GYTS_6芯");
        Assert.NotNull(found);
        Assert.Equal(2m, found!.PriceExcl);
    }

    [Fact]
    public void AddMachinePrice_AndFind()
    {
        var mgr = new LibraryManager();
        mgr.AddMachinePrice(new MachinePrice { Code = "M001", Name = "空压机", Price = 100m });
        Assert.Single(mgr.MachinePrices);
        Assert.Equal("空压机", mgr.FindMachinePrice("M001")!.Name);
    }

    [Fact]
    public void SetRateRow_StoresCorrectly()
    {
        var mgr = new LibraryManager();
        mgr.SetRateRow("通信线路工程", new Core.Engine.NamedRateRow { TechPrice = 114m, LaborPrice = 61m });
        var row = mgr.GetRateRow("通信线路工程");
        Assert.NotNull(row);
        Assert.Equal(114m, row!.TechPrice);
    }

    [Fact]
    public void ClearAll_EmptiesLibraries()
    {
        var mgr = new LibraryManager();
        mgr.AddQuota(new Quota { Code = "TXL3-187", Name = "Test" });
        mgr.AddMaterial(new Material { Name = "光缆", Spec = "6芯" });
        mgr.ClearAll();
        Assert.Empty(mgr.Quotas);
        Assert.Empty(mgr.Materials);
    }
}
