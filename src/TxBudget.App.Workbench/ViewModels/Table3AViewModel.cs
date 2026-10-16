using System.Collections.ObjectModel;
using System.Linq;
using System.Windows.Input;
using TxBudget.App.Infrastructure;
using TxBudget.Core.Engine;
using TxBudget.Core.Model;

namespace TxBudget.App.Workbench.ViewModels;

/// <summary>
/// 表三甲：定额录入 Tab（行内编辑 + 右键菜单）。
/// </summary>
public class Table3AViewModel : WorkbenchTabViewModel
{
    public ObservableCollection<QuantityRowVm> Rows { get; } = new();
    public ICommand InsertRowCommand { get; }
    public ICommand DeleteRowCommand { get; }
    public ICommand ReplaceQuotaCommand { get; }
    public ICommand PickQuotaCommand { get; }

    public Table3AViewModel()
    {
        Title = "表三甲·定额";
        InsertRowCommand = new RelayCommand(_ => InsertRow());
        DeleteRowCommand = new RelayCommand(p => DeleteRow(p as QuantityRowVm));
        ReplaceQuotaCommand = new RelayCommand(p => ReplaceQuota(p as QuantityRowVm));
        PickQuotaCommand = new RelayCommand(p => PickQuota(p as QuantityRowVm));
    }

    public override void Refresh()
    {
        base.Refresh();
        Rows.Clear();
        if (Host?.CurrentProject?.Quantities == null) return;
        foreach (var q in Host.CurrentProject.Quantities)
        {
            Rows.Add(new QuantityRowVm(q, this));
        }
        OnPropertyChanged(nameof(Summary));
    }

    public string Summary
    {
        get
        {
            var n = Rows.Count;
            return $"共 {n} 条工程量记录";
        }
    }

    public void InsertRow()
    {
        if (Host?.CurrentProject == null) return;
        Host.CurrentProject.Quantities ??= new System.Collections.Generic.List<QuantityRow>();
        var row = new QuantityRow { Id = $"qty_{Rows.Count + 1}", Quota = "", Qty = 0m, Coef = 1m };
        Host.CurrentProject.Quantities.Add(row);
        Rows.Add(new QuantityRowVm(row, this));
        MarkDirty();
        OnPropertyChanged(nameof(Summary));
    }

    public void DeleteRow(QuantityRowVm? row)
    {
        if (row == null || Host?.CurrentProject == null) return;
        Host.CurrentProject.Quantities?.Remove(row.Source);
        Rows.Remove(row);
        MarkDirty();
        OnPropertyChanged(nameof(Summary));
    }

    public void ReplaceQuota(QuantityRowVm? row)
    {
        if (row == null) return;
        // 真实实现应打开定额选择器；此处仅作标记
        Host?.StatusMessage = "请在定额选择器中选择新定额替换";
    }

    public void PickQuota(QuantityRowVm? row)
    {
        if (row == null) return;
        Host?.StatusMessage = $"打开定额选择器（行={row.Source.Id}）";
    }
}

/// <summary>
/// 单行工程量行 VM：Quota/Variant/Qty/Coef 编辑后写回项目模型。
/// </summary>
public class QuantityRowVm : System.ComponentModel.INotifyPropertyChanged
{
    public QuantityRow Source { get; }
    private readonly Table3AViewModel _parent;

    public QuantityRowVm(QuantityRow source, Table3AViewModel parent)
    {
        Source = source;
        _parent = parent;
    }

    public string? Quota
    {
        get => Source.Quota;
        set { Source.Quota = value ?? ""; OnPropertyChanged(); _parent.MarkDirty(); }
    }
    public string? Variant
    {
        get => Source.Variant;
        set { Source.Variant = value; OnPropertyChanged(); _parent.MarkDirty(); }
    }
    public decimal? Qty
    {
        get => Source.Qty;
        set { Source.Qty = value; OnPropertyChanged(); _parent.MarkDirty(); }
    }
    public object? Coef
    {
        get => Source.Coef;
        set { Source.Coef = value; OnPropertyChanged(); _parent.MarkDirty(); }
    }

    public event System.ComponentModel.PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([System.Runtime.CompilerServices.CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new System.ComponentModel.PropertyChangedEventArgs(name ?? ""));
}