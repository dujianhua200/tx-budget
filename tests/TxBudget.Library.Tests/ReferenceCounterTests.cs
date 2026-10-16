using TxBudget.Core.Model;
using TxBudget.Library;
using Xunit;

namespace TxBudget.Library.Tests;

public class ReferenceCounterTests
{
    private static LibrarySet CreateLibsWithRefs()
    {
        return new LibrarySet
        {
            Quotas = new List<Quota>
            {
                new() { Code = "TXL3-187", Name = "Q1" },
                new() { Code = "TXL1-008", Name = "Q2" },
            },
            Materials = new List<Material>
            {
                new() { Name = "光缆", Spec = "6芯" },
            },
            Rules = new List<MaterialRule>
            {
                new() { Id = "r1", Quota = "TXL3-187", Material = "光缆", Spec = "6芯" },
                new() { Id = "r2", Quota = "TXL3-187", Material = "抱杆", Spec = "" },
            },
            QuotaMachines = new List<QuotaMachine>
            {
                new() { Id = "m1", Quota = "TXL1-008", MCode = "M001" },
            },
            QuotaInstruments = new List<QuotaMachine>(),
        };
    }

    [Fact]
    public void QuotaReferencedByRules_ReturnsMatchingRules()
    {
        var libs = CreateLibsWithRefs();
        var counter = new ReferenceCounter(libs);
        var refs = counter.QuotaReferencedByRules("TXL3-187");
        Assert.Equal(2, refs.Count);
    }

    [Fact]
    public void QuotaReferencedByRules_NoMatch_ReturnsEmpty()
    {
        var libs = CreateLibsWithRefs();
        var counter = new ReferenceCounter(libs);
        var refs = counter.QuotaReferencedByRules("UNKNOWN");
        Assert.Empty(refs);
    }

    [Fact]
    public void QuotaReferencedByMachines_ReturnsMatches()
    {
        var libs = CreateLibsWithRefs();
        var counter = new ReferenceCounter(libs);
        var refs = counter.QuotaReferencedByMachines("TXL1-008");
        Assert.Single(refs);
    }

    [Fact]
    public void MaterialReferencedByRules_ReturnsMatches()
    {
        var libs = CreateLibsWithRefs();
        var counter = new ReferenceCounter(libs);
        var refs = counter.MaterialReferencedByRules("光缆", "6芯");
        Assert.Single(refs);
    }

    [Fact]
    public void AssessQuotaDelete_WithRefs_CannotDelete()
    {
        var libs = CreateLibsWithRefs();
        var counter = new ReferenceCounter(libs);
        var impact = counter.AssessQuotaDelete("TXL3-187");
        Assert.False(impact.CanDelete);
        Assert.Equal(2, impact.ReferencedBy.Count);
    }

    [Fact]
    public void AssessQuotaDelete_NoRefs_CanDelete()
    {
        var libs = CreateLibsWithRefs();
        var counter = new ReferenceCounter(libs);
        var impact = counter.AssessQuotaDelete("NONEXISTENT");
        Assert.True(impact.CanDelete);
    }

    [Fact]
    public void AssessMaterialDelete_WithRefs_CannotDelete()
    {
        var libs = CreateLibsWithRefs();
        var counter = new ReferenceCounter(libs);
        var impact = counter.AssessMaterialDelete("光缆", "6芯");
        Assert.False(impact.CanDelete);
    }
}
