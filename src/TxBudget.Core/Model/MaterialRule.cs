namespace TxBudget.Core.Model;

public class MaterialRule
{
    public string? Id { get; set; }
    public string Quota { get; set; } = "";
    public string Material { get; set; } = "";
    public string Spec { get; set; } = "";
    /// <summary>变体 / 变体* / 通用 / 备选。</summary>
    public string Kind { get; set; } = "";
    public string? Variant { get; set; }
    public decimal? Consumption { get; set; }
    /// <summary>甲供 / 乙供 / 设备。</summary>
    public string? Supply { get; set; }
}