using System.Collections.ObjectModel;

namespace TxBudget.App.Workbench.ViewModels;

/// <summary>
/// 表五甲：安全生产费 = 折前建安工程费 × 2% + VAT 0（财资〔2022〕136号）。
/// </summary>
public class Table5ViewModel : WorkbenchTabViewModel
{
    public ObservableCollection<TxBudget.Core.Engine.Table5Row> Rows { get; } = new();

    public decimal SafetyFee => _lastResult?.Table5.SafetyFee ?? 0m;
    public decimal TotalExcl => _lastResult?.Table5.TotalExcl ?? 0m;
    public decimal TotalVat => _lastResult?.Table5.TotalVat ?? 0m;
    public decimal TotalIncl => _lastResult?.Table5.TotalIncl ?? 0m;

    public Table5ViewModel() { Title = "表五甲·其他费用"; }

    public override void Refresh()
    {
        base.Refresh();
        Rows.Clear();
        if (_lastResult == null) return;
        foreach (var r in _lastResult.Table5.Rows)
        {
            Rows.Add(r);
        }
        OnPropertyChanged(nameof(SafetyFee));
        OnPropertyChanged(nameof(TotalExcl));
        OnPropertyChanged(nameof(TotalVat));
        OnPropertyChanged(nameof(TotalIncl));
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