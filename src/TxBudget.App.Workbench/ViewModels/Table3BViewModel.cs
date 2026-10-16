using System.Collections.ObjectModel;

namespace TxBudget.App.Workbench.ViewModels;

public class Table3BViewModel : WorkbenchTabViewModel
{
    public ObservableCollection<EquipRowVm> Rows { get; } = new();

    public Table3BViewModel() { Title = "表三乙·机械台班"; }

    public override void Refresh()
    {
        base.Refresh();
        Rows.Clear();
        if (Host == null || Host.CurrentProject == null) return;
        var result = _lastResult;
        if (result == null) return;
        foreach (var r in result.Table3B.Rows)
        {
            Rows.Add(new EquipRowVm
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

    public decimal Total => _lastResult?.Table3B.Total ?? 0m;

    private TxBudget.Core.Engine.CalcResult? _lastResult;

    protected override void OnRecomputeRequested(object? sender, System.EventArgs e)
    {
        if (Host?.CurrentProject == null) return;
        _lastResult = TxBudget.Core.Engine.CalcEngine.CalcProject(
            Host.CurrentProject, Host.CurrentLibs ?? new TxBudget.Core.Model.LibrarySet());
        base.OnRecomputeRequested(sender, e);
    }

    public class EquipRowVm
    {
        public string Quota { get; set; } = "";
        public string QuotaName { get; set; } = "";
        public string Unit { get; set; } = "";
        public decimal Qty { get; set; }
        public string EquipName { get; set; } = "";
        public string EquipUnit { get; set; } = "";
        public decimal Consumption { get; set; }
        public decimal Price { get; set; }
        public decimal Sessions { get; set; }
        public decimal Amount { get; set; }
    }
}