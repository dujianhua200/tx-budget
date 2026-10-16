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

    [Fact]
    public void FindQuota_LargeSet_O1Performance()
    {
        var mgr = new LibraryManager();
        for (int i = 0; i < 5000; i++)
        {
            mgr.AddQuota(new Quota { Code = $"Q{i:0000}", Name = $"Quota{i}" });
        }
        var found = mgr.FindQuota("Q4999");
        Assert.NotNull(found);
        Assert.Equal("Quota4999", found!.Name);
    }

    [Fact]
    public void ContainsQuota_FindsExisting()
    {
        var mgr = new LibraryManager();
        mgr.AddQuota(new Quota { Code = "TXL3-187", Name = "Test" });
        Assert.True(mgr.ContainsQuota("TXL3-187"));
        Assert.False(mgr.ContainsQuota("NONE"));
    }

    [Fact]
    public void ContainsMaterial_FindsExisting()
    {
        var mgr = new LibraryManager();
        mgr.AddMaterial(new Material { Name = "光缆", Spec = "GYTS_6芯" });
        Assert.True(mgr.ContainsMaterial("光缆", "GYTS_6芯"));
        Assert.False(mgr.ContainsMaterial("光缆", "NONE"));
    }

    [Fact]
    public void RebuildIndexes_AfterExternalListChange()
    {
        var libs = new LibrarySet
        {
            Quotas = new List<Quota> { new() { Code = "A", Name = "A" } },
            Materials = new(),
            Rules = new(),
            MachinePrices = new(),
            InstrumentPrices = new(),
            QuotaMachines = new(),
            QuotaInstruments = new(),
            Rates = new RatesBlob { ByProjectType = new() },
            WinterTable = new(),
            DiscountRule = new(),
            Table5Fees = new(),
            Dispatch = Dispatch.Default(),
        };
        var mgr = new LibraryManager(libs);
        Assert.True(mgr.ContainsQuota("A"));

        libs.Quotas.Add(new Quota { Code = "B", Name = "B" });
        mgr.RebuildIndexes();
        Assert.True(mgr.ContainsQuota("B"));
    }
}
