using System.Collections.Generic;

namespace TxBudget.Core.Model;

public class Project
{
    public ProjectInfo? Info { get; set; }
    public List<QuantityRow>? Quantities { get; set; }
    public List<MaterialAdjust>? MaterialAdjust { get; set; }
    public List<PriceOverride>? PriceOverrides { get; set; }
    public List<RuleOverride>? RuleOverrides { get; set; }
    public Engine.RateOverrides? RateOverrides { get; set; }
    public List<Engine.Table5Override>? Table5Overrides { get; set; }
}

public class MaterialAdjust
{
    public string Key { get; set; } = "";
    public decimal? Delta { get; set; }
}

public class PriceOverride
{
    public string Key { get; set; } = "";
    public decimal? PriceExcl { get; set; }
}

public class RuleOverride
{
    public string RuleId { get; set; } = "";
    public bool Enabled { get; set; }
}