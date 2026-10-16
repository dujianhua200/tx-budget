using System.Collections.ObjectModel;

namespace TxBudget.App.Workbench.ViewModels;

public class Table3CViewModel : WorkbenchTabViewModel
{
    public ObservableCollection<Table3BViewModel.EquipRowVm> Rows { get; } = new();

    public Table3CViewModel() { Title = "表三丙·仪器仪表"; }

    public override void Refresh()
    {
        base.Refresh();
        Rows.Clear();
        if (Host == null || Host.CurrentProject == null) return;
        if (_lastResult == null) return;
        foreach (var r in _lastResult.Table3C.Rows)
        {
            Rows.Add(new Table3BViewModel.EquipRowVm
            {
                Quota = r.Quota,
                QuotaName = r.QuotaName,
                Unit = r.Unit,
                Qty = r.Qty,
                EquipName = r.EquipName,
                EquipUnit = r.EquipUnit,
                Consumption = r.Consumption,
                Price = r.Price,
                Sessions = r.Sessions,
                Amount = r.Amount,
            });
        }
        OnPropertyChanged(nameof(Total));
    }

    public decimal Total => _lastResult?.Table3C.Total ?? 0m;

    private TxBudget.Core.Engine.CalcResult? _lastResult;

    protected override void OnRecomputeRequested(object? sender, System.EventArgs e)
    {
        if (Host?.CurrentProject == null) return;
        _lastResult = TxBudget.Core.Engine.CalcEngine.CalcProject(
            Host.CurrentProject, Host.CurrentLibs ?? new TxBudget.Core.Model.LibrarySet());
        base.OnRecomputeRequested(sender, e);
    }
}