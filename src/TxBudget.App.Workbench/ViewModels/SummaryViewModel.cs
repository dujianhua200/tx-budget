namespace TxBudget.App.Workbench.ViewModels;

public class SummaryViewModel : WorkbenchTabViewModel
{
    public System.Collections.ObjectModel.ObservableCollection<SummaryRow> Rows { get; }
        = new System.Collections.ObjectModel.ObservableCollection<SummaryRow>();

    public SummaryViewModel() { Title = "汇总表"; }

    public decimal ConstructionExcl => _lastResult?.Summary.ConstructionExcl ?? 0m;
    public decimal ConstructionVat => _lastResult?.Summary.ConstructionVat ?? 0m;
    public decimal ConstructionIncl => ConstructionExcl + ConstructionVat;
    public decimal Other => _lastResult?.Summary.Other ?? 0m;
    public decimal OtherVat => _lastResult?.Summary.OtherVat ?? 0m;
    public decimal OtherIncl => Other + OtherVat;
    public decimal TotalExcl => _lastResult?.Summary.TotalExcl ?? 0m;
    public decimal TotalVat => _lastResult?.Summary.TotalVat ?? 0m;
    public decimal TotalIncl => _lastResult?.Summary.TotalIncl ?? 0m;

    public override void Refresh()
    {
        base.Refresh();
        Rows.Clear();
        Rows.Add(new SummaryRow
        {
            Name = Host?.CurrentProject?.Info?.建设项目名称 ?? "工程总计",
            ConstructionExcl = ConstructionExcl,
            ConstructionVat = ConstructionVat,
            ConstructionIncl = ConstructionIncl,
            Other = Other,
            OtherVat = OtherVat,
            OtherIncl = OtherIncl,
            TotalIncl = TotalIncl,
        });
        OnPropertyChanged(nameof(ConstructionExcl));
        OnPropertyChanged(nameof(ConstructionVat));
        OnPropertyChanged(nameof(ConstructionIncl));
        OnPropertyChanged(nameof(Other));
        OnPropertyChanged(nameof(OtherVat));
        OnPropertyChanged(nameof(OtherIncl));
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

/// <summary>汇总表单行。</summary>
public class SummaryRow
{
    public string Name { get; set; } = "";
    public decimal ConstructionExcl { get; set; }
    public decimal ConstructionVat { get; set; }
    public decimal ConstructionIncl { get; set; }
    public decimal Other { get; set; }
    public decimal OtherVat { get; set; }
    public decimal OtherIncl { get; set; }
    public decimal TotalIncl { get; set; }
}