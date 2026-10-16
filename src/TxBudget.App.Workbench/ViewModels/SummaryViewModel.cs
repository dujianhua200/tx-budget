namespace TxBudget.App.Workbench.ViewModels;

public class SummaryViewModel : WorkbenchTabViewModel
{
    public SummaryViewModel() { Title = "汇总表"; }

    public decimal ConstructionExcl => _lastResult?.Summary.ConstructionExcl ?? 0m;
    public decimal ConstructionVat => _lastResult?.Summary.ConstructionVat ?? 0m;
    public decimal Other => _lastResult?.Summary.Other ?? 0m;
    public decimal OtherVat => _lastResult?.Summary.OtherVat ?? 0m;
    public decimal TotalExcl => _lastResult?.Summary.TotalExcl ?? 0m;
    public decimal TotalVat => _lastResult?.Summary.TotalVat ?? 0m;
    public decimal TotalIncl => _lastResult?.Summary.TotalIncl ?? 0m;

    public override void Refresh()
    {
        base.Refresh();
        OnPropertyChanged(nameof(ConstructionExcl));
        OnPropertyChanged(nameof(ConstructionVat));
        OnPropertyChanged(nameof(Other));
        OnPropertyChanged(nameof(OtherVat));
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