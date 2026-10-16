using System.Collections.Generic;
using System.Linq;

namespace TxBudget.App.Workbench.ViewModels;

/// <summary>
/// 双表二：折前 + 折后并排展示 + 取费模板切换。
/// </summary>
public class Table2ViewModel : WorkbenchTabViewModel
{
    public List<TxBudget.Core.Engine.DiscountEngine.LineDef> LineDefs { get; } =
        TxBudget.Core.Engine.DiscountEngine.DiscountLineDefs.ToList();

    public Dictionary<string, decimal> Before { get; private set; } = new();
    public Dictionary<string, decimal> After { get; private set; } = new();

    public IEnumerable<string> DiscountTemplateOptions { get; } = new[]
    {
        "全折扣(默认)",
        "标准模板(无折扣=1)",
        "通信线路模板",
    };

    private string _selectedTemplate = "全折扣(默认)";
    public string SelectedTemplate
    {
        get => _selectedTemplate;
        set { _selectedTemplate = value; Host?.MarkDirty(); }
    }

    public Table2ViewModel() { Title = "双表二·取费"; }

    public override void Refresh()
    {
        base.Refresh();
        if (_lastResult == null) return;
        Before = _lastResult.Table2Before;
        After = _lastResult.Table2After;
        OnPropertyChanged(nameof(Before));
        OnPropertyChanged(nameof(After));
    }

    private TxBudget.Core.Engine.CalcResult? _lastResult;

    protected override void OnRecomputeRequested(object? sender, System.EventArgs e)
    {
        if (Host?.CurrentProject == null) return;
        _lastResult = TxBudget.Core.Engine.CalcEngine.CalcProject(
            Host.CurrentProject, Host.CurrentLibs ?? new TxBudget.Core.Model.LibrarySet());
        base.OnRecomputeRequested(sender, e);
    }
}