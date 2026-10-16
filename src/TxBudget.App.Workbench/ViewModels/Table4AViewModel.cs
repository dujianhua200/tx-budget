using System.Collections.ObjectModel;
using System.Linq;
using System.Windows.Input;
using TxBudget.App.Infrastructure;

namespace TxBudget.App.Workbench.ViewModels;

/// <summary>
/// 表四甲：材料汇总（甲供分类 + 批量增值税设置）。
/// </summary>
public class Table4AViewModel : WorkbenchTabViewModel
{
    public ObservableCollection<MatRowVm> Rows { get; } = new();
    public ICommand BatchSetVatCommand { get; }

    public Table4AViewModel()
    {
        Title = "表四甲·甲供材料";
        BatchSetVatCommand = new RelayCommand(p => BatchSetVat(p as string));
    }

    public override void Refresh()
    {
        base.Refresh();
        Rows.Clear();
        if (_lastResult == null) return;
        foreach (var r in _lastResult.Table4A.Rows)
        {
            Rows.Add(new MatRowVm
            {
                Key = r.Key,
                Name = r.Name,
                Spec = r.Spec,
                Unit = r.Unit,
                Qty = r.Qty,
                PriceExcl = r.PriceExcl,
                PriceVat = r.PriceVat,
                PriceIncl = r.PriceIncl,
                AmtExcl = r.AmtExcl,
                AmtVat = r.AmtVat,
                AmtIncl = r.AmtIncl,
            });
        }
        OnPropertyChanged(nameof(TotalExcl));
        OnPropertyChanged(nameof(TotalVat));
        OnPropertyChanged(nameof(TotalIncl));
    }

    public decimal TotalExcl => _lastResult?.Table4A.TotalExcl ?? 0m;
    public decimal TotalVat => _lastResult?.Table4A.TotalVat ?? 0m;
    public decimal TotalIncl => _lastResult?.Table4A.TotalIncl ?? 0m;

    private TxBudget.Core.Engine.CalcResult? _lastResult;

    protected override void OnRecomputeRequested(object? sender, System.EventArgs e)
    {
        if (Host?.CurrentProject == null) return;
        _lastResult = TxBudget.Core.Engine.CalcEngine.CalcProject(
            Host.CurrentProject, Host.CurrentLibs ?? new TxBudget.Core.Model.LibrarySet());
        base.OnRecomputeRequested(sender, e);
    }

    /// <summary>
    /// 批量设置所有行的增值税（用于批量调整）。
    /// </summary>
    public void BatchSetVat(string? vatStr)
    {
        if (!decimal.TryParse(vatStr, out var vat))
        {
            Host?.StatusMessage = "批量增值税：输入格式错误";
            return;
        }
        foreach (var row in Rows)
        {
            row.PriceVat = System.Math.Round(row.PriceExcl * vat, 2);
            row.PriceIncl = row.PriceExcl + row.PriceVat;
            row.AmtVat = System.Math.Round(row.Qty * row.PriceVat, 2);
            row.AmtIncl = row.AmtExcl + row.AmtVat;
        }
        Host?.StatusMessage = $"已批量设置 {Rows.Count} 行增值税为 {vat:P}";
    }

    public class MatRowVm
    {
        public string Key { get; set; } = "";
        public string Name { get; set; } = "";
        public string Spec { get; set; } = "";
        public string Unit { get; set; } = "";
        public decimal Qty { get; set; }
        public decimal PriceExcl { get; set; }
        public decimal PriceVat { get; set; }
        public decimal PriceIncl { get; set; }
        public decimal AmtExcl { get; set; }
        public decimal AmtVat { get; set; }
        public decimal AmtIncl { get; set; }
    }
}