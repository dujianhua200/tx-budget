namespace TxBudget.Core.Model;

public class Material
{
    public string? Id { get; set; }
    public string Name { get; set; } = "";
    public string Spec { get; set; } = "";
    public string Unit { get; set; } = "";
    public decimal? PriceExcl { get; set; }
    /// <summary>甲供 / 乙供 / 设备。</summary>
    public string? Supply { get; set; }
}