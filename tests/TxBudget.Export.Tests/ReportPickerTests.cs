using TxBudget.Export;
using Xunit;

namespace TxBudget.Export.Tests;

public class ReportPickerTests
{
    [Fact]
    public void Toggle_AddsAndRemoves()
    {
        var picker = new ReportPicker();
        picker.Toggle("Table1");
        Assert.Contains("Table1", picker.SelectedKeys);
        picker.Toggle("Table1");
        Assert.DoesNotContain("Table1", picker.SelectedKeys);
    }

    [Fact]
    public void SelectAll_SelectsEverything()
    {
        var picker = new ReportPicker();
        picker.SelectAll();
        Assert.Equal(ReportDefinitions.AllReports.Count, picker.SelectedKeys.Count);
    }

    [Fact]
    public void Clear_RemovesAll()
    {
        var picker = new ReportPicker();
        picker.SelectAll();
        picker.Clear();
        Assert.Empty(picker.SelectedKeys);
    }

    [Fact]
    public void GetSelectedDefs_ReturnsCorrectDefs()
    {
        var picker = new ReportPicker();
        picker.SetSelected("Table1", true);
        picker.SetSelected("Table2", true);
        var defs = picker.GetSelectedDefs();
        Assert.Equal(2, defs.Count);
        Assert.Contains(defs, d => d.Key == "Table1");
        Assert.Contains(defs, d => d.Key == "Table2");
    }

    [Fact]
    public void PreviewKey_SetAndGet()
    {
        var picker = new ReportPicker();
        picker.PreviewKey = "Table1";
        Assert.Equal("Table1", picker.PreviewKey);
    }
}
