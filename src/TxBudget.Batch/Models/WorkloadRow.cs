namespace TxBudget.Batch.Models;

/// <summary>
/// 工作量表中的一行（用户录入的原始数据）。
/// </summary>
public class WorkloadRow
{
    public string? Id { get; set; }
    /// <summary>定额编号（如 TXL3-187）</summary>
    public string QuotaCode { get; set; } = "";
    /// <summary>定额名称（可选，用于展示/校验）</summary>
    public string? QuotaName { get; set; }
    /// <summary>变体标识（如 "6芯"、"架设吊线式墙壁光缆 6芯(工日X0.5)"）</summary>
    public string? Variant { get; set; }
    /// <summary>计量单位</summary>
    public string? Unit { get; set; }
    /// <summary>工程量</summary>
    public decimal? Quantity { get; set; }
    /// <summary>系数（object：支持数字、字符串表达式或布尔值）</summary>
    public object? Coefficient { get; set; }
    /// <summary>行备注</summary>
    public string? Note { get; set; }
}
