namespace TxBudget.Core.Model;

public class Quota
{
    public string? Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Unit { get; set; } = "";
    public decimal? Tech { get; set; }
    public decimal? Labor { get; set; }
    public decimal? Coef { get; set; }
    public string? Book { get; set; }
    public string? Alias { get; set; }
}