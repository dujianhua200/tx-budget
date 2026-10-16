using System.Collections.Generic;
using TxBudget.Core.Engine;

namespace TxBudget.Core.Model;

public class LibrarySet
{
    public List<Quota>? Quotas { get; set; }
    public List<Material>? Materials { get; set; }
    public List<MaterialRule>? Rules { get; set; }
    public List<MachinePrice>? MachinePrices { get; set; }
    public List<MachinePrice>? InstrumentPrices { get; set; }
    public List<QuotaMachine>? QuotaMachines { get; set; }
    public List<QuotaMachine>? QuotaInstruments { get; set; }
    public RatesBlob? Rates { get; set; }
    public Dictionary<string, decimal>? WinterTable { get; set; }
    public DiscountRule? DiscountRule { get; set; }
    public List<Table5Config.Table5Fee>? Table5Fees { get; set; }
    public Dispatch? Dispatch { get; set; }
}