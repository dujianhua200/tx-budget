using TxBudget.Core.Engine;
using TxBudget.Core.Model;

namespace TxBudget.Library;

/// <summary>
/// 标准库管理器：对 8 类库数据进行增删改查。
/// 8 类库：定额、材料、材料规则、机械价格、仪表价格、定额机械、定额仪表、费率。
/// </summary>
public class LibraryManager
{
    private LibrarySet _libs;

    public LibraryManager(LibrarySet? initial = null)
    {
        _libs = initial ?? new LibrarySet
        {
            Quotas = new(),
            Materials = new(),
            Rules = new(),
            MachinePrices = new(),
            InstrumentPrices = new(),
            QuotaMachines = new(),
            QuotaInstruments = new(),
            Rates = new RatesBlob { ByProjectType = new() },
            WinterTable = new(),
            DiscountRule = new(),
            Table5Fees = new(),
            Dispatch = Dispatch.Default(),
        };
    }

    public LibrarySet Libraries => _libs;

    // === Quota 定额 ===
    public IReadOnlyList<Quota> Quotas => _libs.Quotas ?? new List<Quota>();
    public void AddQuota(Quota item) => (_libs.Quotas ??= new()).Add(item);
    public bool RemoveQuota(string code) => (_libs.Quotas ??= new()).RemoveAll(q => q.Code == code) > 0;
    public Quota? FindQuota(string code) => _libs.Quotas?.FirstOrDefault(q => q.Code == code);
    public void UpdateQuota(Quota item)
    {
        var existing = FindQuota(item.Code);
        if (existing != null)
        {
            existing.Name = item.Name;
            existing.Unit = item.Unit;
            existing.Tech = item.Tech;
            existing.Labor = item.Labor;
            existing.Coef = item.Coef;
            existing.Book = item.Book;
            existing.Alias = item.Alias;
        }
    }

    // === Material 材料 ===
    public IReadOnlyList<Material> Materials => _libs.Materials ?? new List<Material>();
    public void AddMaterial(Material item) => (_libs.Materials ??= new()).Add(item);
    public bool RemoveMaterial(string name, string spec) =>
        (_libs.Materials ??= new()).RemoveAll(m => m.Name == name && m.Spec == spec) > 0;
    public Material? FindMaterial(string name, string spec) =>
        _libs.Materials?.FirstOrDefault(m => m.Name == name && m.Spec == spec);
    public void UpdateMaterial(Material item)
    {
        var existing = FindMaterial(item.Name, item.Spec);
        if (existing != null)
        {
            existing.Unit = item.Unit;
            existing.PriceExcl = item.PriceExcl;
            existing.Supply = item.Supply;
        }
    }

    // === MaterialRule 材料规则 ===
    public IReadOnlyList<MaterialRule> Rules => _libs.Rules ?? new List<MaterialRule>();
    public void AddRule(MaterialRule item) => (_libs.Rules ??= new()).Add(item);
    public bool RemoveRule(string id) => (_libs.Rules ??= new()).RemoveAll(r => r.Id == id) > 0;
    public MaterialRule? FindRule(string id) => _libs.Rules?.FirstOrDefault(r => r.Id == id);
    public void UpdateRule(MaterialRule item)
    {
        var existing = FindRule(item.Id ?? "");
        if (existing != null)
        {
            existing.Quota = item.Quota;
            existing.Material = item.Material;
            existing.Spec = item.Spec;
            existing.Kind = item.Kind;
            existing.Variant = item.Variant;
            existing.Consumption = item.Consumption;
            existing.Supply = item.Supply;
        }
    }

    // === MachinePrice 机械价格 ===
    public IReadOnlyList<MachinePrice> MachinePrices => _libs.MachinePrices ?? new List<MachinePrice>();
    public void AddMachinePrice(MachinePrice item) => (_libs.MachinePrices ??= new()).Add(item);
    public bool RemoveMachinePrice(string code) => (_libs.MachinePrices ??= new()).RemoveAll(m => m.Code == code) > 0;
    public MachinePrice? FindMachinePrice(string code) => _libs.MachinePrices?.FirstOrDefault(m => m.Code == code);
    public void UpdateMachinePrice(MachinePrice item)
    {
        var existing = FindMachinePrice(item.Code);
        if (existing != null)
        {
            existing.Name = item.Name;
            existing.Price = item.Price;
        }
    }

    // === InstrumentPrice 仪表价格 ===
    public IReadOnlyList<MachinePrice> InstrumentPrices => _libs.InstrumentPrices ?? new List<MachinePrice>();
    public void AddInstrumentPrice(MachinePrice item) => (_libs.InstrumentPrices ??= new()).Add(item);
    public bool RemoveInstrumentPrice(string code) => (_libs.InstrumentPrices ??= new()).RemoveAll(m => m.Code == code) > 0;
    public MachinePrice? FindInstrumentPrice(string code) => _libs.InstrumentPrices?.FirstOrDefault(m => m.Code == code);
    public void UpdateInstrumentPrice(MachinePrice item)
    {
        var existing = FindInstrumentPrice(item.Code);
        if (existing != null)
        {
            existing.Name = item.Name;
            existing.Price = item.Price;
        }
    }

    // === QuotaMachine 定额机械 ===
    public IReadOnlyList<QuotaMachine> QuotaMachines => _libs.QuotaMachines ?? new List<QuotaMachine>();
    public void AddQuotaMachine(QuotaMachine item) => (_libs.QuotaMachines ??= new()).Add(item);
    public bool RemoveQuotaMachine(string id) => (_libs.QuotaMachines ??= new()).RemoveAll(m => m.Id == id) > 0;
    public QuotaMachine? FindQuotaMachine(string id) => _libs.QuotaMachines?.FirstOrDefault(m => m.Id == id);

    // === QuotaInstrument 定额仪表 ===
    public IReadOnlyList<QuotaMachine> QuotaInstruments => _libs.QuotaInstruments ?? new List<QuotaMachine>();
    public void AddQuotaInstrument(QuotaMachine item) => (_libs.QuotaInstruments ??= new()).Add(item);
    public bool RemoveQuotaInstrument(string id) => (_libs.QuotaInstruments ??= new()).RemoveAll(m => m.Id == id) > 0;
    public QuotaMachine? FindQuotaInstrument(string id) => _libs.QuotaInstruments?.FirstOrDefault(m => m.Id == id);

    // === Rates 费率 ===
    public RatesBlob? Rates => _libs.Rates;
    public void SetRateRow(string projectType, NamedRateRow row)
    {
        _libs.Rates ??= new RatesBlob { ByProjectType = new() };
        _libs.Rates.ByProjectType ??= new();
        _libs.Rates.ByProjectType[projectType] = row;
    }
    public NamedRateRow? GetRateRow(string projectType)
    {
        NamedRateRow? row = null;
        _libs.Rates?.ByProjectType?.TryGetValue(projectType, out row);
        return row;
    }

    // === WinterTable 冬雨季表 ===
    public Dictionary<string, decimal>? WinterTable => _libs.WinterTable;
    public void SetWinterRate(string region, decimal rate)
    {
        _libs.WinterTable ??= new();
        _libs.WinterTable[region] = rate;
    }

    // === Table5Fees ===
    public IReadOnlyList<Table5Config.Table5Fee> Table5Fees => _libs.Table5Fees ?? new List<Table5Config.Table5Fee>();
    public void SetTable5Fees(List<Table5Config.Table5Fee> fees) => _libs.Table5Fees = fees;

    // === Dispatch ===
    public Dispatch? Dispatch => _libs.Dispatch;
    public void SetDispatch(Dispatch dispatch) => _libs.Dispatch = dispatch;

    /// <summary>
    /// 清空全部库数据。
    /// </summary>
    public void ClearAll()
    {
        _libs.Quotas?.Clear();
        _libs.Materials?.Clear();
        _libs.Rules?.Clear();
        _libs.MachinePrices?.Clear();
        _libs.InstrumentPrices?.Clear();
        _libs.QuotaMachines?.Clear();
        _libs.QuotaInstruments?.Clear();
        _libs.Rates?.ByProjectType?.Clear();
        _libs.WinterTable?.Clear();
    }
}
