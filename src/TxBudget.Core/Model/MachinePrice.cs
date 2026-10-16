namespace TxBudget.Core.Model;

public class MachinePrice
{
    public string? Id { get; set; }
    public string Code { get; set; } = "";
    public string? Name { get; set; }
    public decimal Price { get; set; }
}

public class QuotaMachine
{
    public string? Id { get; set; }
    public string Quota { get; set; } = "";
    public string MCode { get; set; } = "";
    public string? MName { get; set; }
    public string? Unit { get; set; }
    public decimal? Qty { get; set; }
}