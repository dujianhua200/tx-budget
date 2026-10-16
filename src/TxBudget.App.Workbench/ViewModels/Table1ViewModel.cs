namespace TxBudget.App.Workbench.ViewModels;

public class Table1ViewModel : WorkbenchTabViewModel
{
    public Table1ViewModel() { Title = "表一·预算汇总"; }

    public decimal BeforeDiscount => _lastResult?.Table1.BeforeDiscount ?? 0m;
    public decimal AfterDiscount => _lastResult?.Table1.AfterDiscount ?? 0m;
    public decimal TaxBefore => _lastResult?.Table1.TaxBefore ?? 0m;
    public decimal TaxAfter => _lastResult?.Table1.TaxAfter ?? 0m;
    public decimal SumExcl => _lastResult?.Table1.SumExcl ?? 0m;
    public decimal SumVat => _lastResult?.Table1.SumVat ?? 0m;
    public decimal SumIncl => _lastResult?.Table1.SumIncl ?? 0m;
    public decimal GrandIncl => _lastResult?.Table1.GrandIncl ?? 0m;
    public decimal OtherFee => _lastResult?.Table1.OtherFee ?? 0m;

    public override void Refresh()
    {
        base.Refresh();
        OnPropertyChanged(nameof(BeforeDiscount));
        OnPropertyChanged(nameof(AfterDiscount));
        OnPropertyChanged(nameof(TaxBefore));
        OnPropertyChanged(nameof(TaxAfter));
        OnPropertyChanged(nameof(SumExcl));
        OnPropertyChanged(nameof(SumVat));
        OnPropertyChanged(nameof(SumIncl));
        OnPropertyChanged(nameof(GrandIncl));
        OnPropertyChanged(nameof(OtherFee));
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