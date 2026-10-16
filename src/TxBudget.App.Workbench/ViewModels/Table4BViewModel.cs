using System.Collections.ObjectModel;

namespace TxBudget.App.Workbench.ViewModels;

public class Table4BViewModel : WorkbenchTabViewModel
{
    public ObservableCollection<Table4AViewModel.MatRowVm> Rows { get; } = new();

    public Table4BViewModel() { Title = "表四乙·乙供材料"; }

    public override void Refresh()
    {
        base.Refresh();
        Rows.Clear();
        if (_lastResult == null) return;
        foreach (var r in _lastResult.Table4B.Rows)
        {
            Rows.Add(new Table4AViewModel.MatRowVm
            {
                Key = r.Key, Name = r.Name, Spec = r.Spec, Unit = r.Unit,
                Qty = r.Qty, PriceExcl = r.PriceExcl, PriceVat = r.PriceVat,
                PriceIncl = r.PriceIncl, AmtExcl = r.AmtExcl, AmtVat = r.AmtVat, AmtIncl = r.AmtIncl,
            });
        }
        OnPropertyChanged(nameof(TotalExcl));
        OnPropertyChanged(nameof(TotalVat));
        OnPropertyChanged(nameof(TotalIncl));
    }

    public decimal TotalExcl => _lastResult?.Table4B.TotalExcl ?? 0m;
    public decimal TotalVat => _lastResult?.Table4B.TotalVat ?? 0m;
    public decimal TotalIncl => _lastResult?.Table4B.TotalIncl ?? 0m;

    private TxBudget.Core.Engine.CalcResult? _lastResult;

    protected override void OnRecomputeRequested(object? sender, System.EventArgs e)
    {
        if (Host?.CurrentProject == null) return;
        _lastResult = TxBudget.Core.Engine.CalcEngine.CalcProject(
            Host.CurrentProject, Host.CurrentLibs ?? new TxBudget.Core.Model.LibrarySet());
        base.OnRecomputeRequested(sender, e);
    }
}