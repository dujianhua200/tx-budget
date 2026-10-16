namespace TxBudget.Batch.Models;

/// <summary>
/// 工作量表（一个 Excel/CSV 工作表对应一张工作量表）。
/// </summary>
public class WorkloadTable
{
    public string? SheetName { get; set; }
    public string? ProjectName { get; set; }
    public string? ProjectType { get; set; }
    public List<WorkloadRow> Rows { get; set; } = new();
}
