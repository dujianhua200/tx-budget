namespace TxBudget.Core.Model;

public class QuantityRow
{
    public string? Id { get; set; }
    public string Quota { get; set; } = "";
    public string? Variant { get; set; }
    public string? Unit { get; set; }
    public decimal? Qty { get; set; }
    public object? Coef { get; set; }
}