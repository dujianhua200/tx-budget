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

    // === 索引字典：确保 O(1) 查询 ===
    private Dictionary<string, Quota> _quotaIndex = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<(string Name, string Spec), Material> _materialIndex = new();
    private Dictionary<string, MaterialRule> _ruleIndex = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, MachinePrice> _machinePriceIndex = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, MachinePrice> _instrumentPriceIndex = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, QuotaMachine> _quotaMachineIndex = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, QuotaMachine> _quotaInstrumentIndex = new(StringComparer.OrdinalIgnoreCase);

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
        RebuildIndexes();
    }

    public LibrarySet Libraries => _libs;

    /// <summary>
    /// 重建所有索引。在批量加载或替换后调用。
    /// </summary>
    public void RebuildIndexes()
    {
        _quotaIndex = _libs.Quotas?.ToDictionary(q => q.Code, q => q, StringComparer.OrdinalIgnoreCase)
            ?? new Dictionary<string, Quota>(StringComparer.OrdinalIgnoreCase);

        _materialIndex = _libs.Materials?.ToDictionary(
            m => (m.Name ?? "", m.Spec ?? ""),
            m => m) ?? new Dictionary<(string, string), Material>();

        _ruleIndex = _libs.Rules?.ToDictionary(r => r.Id ?? "", r => r, StringComparer.OrdinalIgnoreCase)
            ?? new Dictionary<string, MaterialRule>(StringComparer.OrdinalIgnoreCase);

        _machinePriceIndex = _libs.MachinePrices?.ToDictionary(m => m.Code, m => m, StringComparer.OrdinalIgnoreCase)
            ?? new Dictionary<string, MachinePrice>(StringComparer.OrdinalIgnoreCase);

        _instrumentPriceIndex = _libs.InstrumentPrices?.ToDictionary(m => m.Code, m => m, StringComparer.OrdinalIgnoreCase)
            ?? new Dictionary<string, MachinePrice>(StringComparer.OrdinalIgnoreCase);

        _quotaMachineIndex = _libs.QuotaMachines?.ToDictionary(m => m.Id ?? "", m => m, StringComparer.OrdinalIgnoreCase)
            ?? new Dictionary<string, QuotaMachine>(StringComparer.OrdinalIgnoreCase);

        _quotaInstrumentIndex = _libs.QuotaInstruments?.ToDictionary(m => m.Id ?? "", m => m, StringComparer.OrdinalIgnoreCase)
            ?? new Dictionary<string, QuotaMachine>(StringComparer.OrdinalIgnoreCase);
    }

    // === Quota 定额 ===
    public IReadOnlyList<Quota> Quotas => _libs.Quotas ?? new List<Quota>();
    public void AddQuota(Quota item)
    {
        (_libs.Quotas ??= new()).Add(item);
        _quotaIndex[item.Code] = item;
    }
    public bool RemoveQuota(string code)
    {
        var removed = _quotaIndex.Remove(code);
        if (removed && _libs.Quotas != null)
            _libs.Quotas.RemoveAll(q => q.Code.Equals(code, StringComparison.OrdinalIgnoreCase));
        return removed;
    }
    public Quota? FindQuota(string code) => _quotaIndex.TryGetValue(code, out var q) ? q : null;
    public bool ContainsQuota(string code) => _quotaIndex.ContainsKey(code);
    public void UpdateQuota(Quota item)
    {
        if (_quotaIndex.TryGetValue(item.Code, out var existing))
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
    public void AddMaterial(Material item)
    {
        (_libs.Materials ??= new()).Add(item);
        _materialIndex[(item.Name ?? "", item.Spec ?? "")] = item;
    }
    public bool RemoveMaterial(string name, string spec)
    {
        var key = (name, spec);
        var removed = _materialIndex.Remove(key);
        if (removed && _libs.Materials != null)
            _libs.Materials.RemoveAll(m => m.Name == name && m.Spec == spec);
        return removed;
    }
    public Material? FindMaterial(string name, string spec) => _materialIndex.TryGetValue((name, spec), out var m) ? m : null;
    public bool ContainsMaterial(string name, string spec) => _materialIndex.ContainsKey((name, spec));
    public void UpdateMaterial(Material item)
    {
        var key = (item.Name, item.Spec);
        if (_materialIndex.TryGetValue(key, out var existing))
        {
            existing.Unit = item.Unit;
            existing.PriceExcl = item.PriceExcl;
            existing.Supply = item.Supply;
        }
    }

    // === MaterialRule 材料规则 ===
    public IReadOnlyList<MaterialRule> Rules => _libs.Rules ?? new List<MaterialRule>();
    public void AddRule(MaterialRule item)
    {
        (_libs.Rules ??= new()).Add(item);
        _ruleIndex[item.Id ?? ""] = item;
    }
    public bool RemoveRule(string id)
    {
        var removed = _ruleIndex.Remove(id);
        if (removed && _libs.Rules != null)
            _libs.Rules.RemoveAll(r => r.Id == id);
        return removed;
    }
    public MaterialRule? FindRule(string id) => _ruleIndex.TryGetValue(id, out var r) ? r : null;
    public bool ContainsRule(string id) => _ruleIndex.ContainsKey(id);
    public void UpdateRule(MaterialRule item)
    {
        if (_ruleIndex.TryGetValue(item.Id ?? "", out var existing))
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
    public void AddMachinePrice(MachinePrice item)
    {
        (_libs.MachinePrices ??= new()).Add(item);
        _machinePriceIndex[item.Code] = item;
    }
    public bool RemoveMachinePrice(string code)
    {
        var removed = _machinePriceIndex.Remove(code);
        if (removed && _libs.MachinePrices != null)
            _libs.MachinePrices.RemoveAll(m => m.Code == code);
        return removed;
    }
    public MachinePrice? FindMachinePrice(string code) => _machinePriceIndex.TryGetValue(code, out var m) ? m : null;
    public bool ContainsMachinePrice(string code) => _machinePriceIndex.ContainsKey(code);
    public void UpdateMachinePrice(MachinePrice item)
    {
        if (_machinePriceIndex.TryGetValue(item.Code, out var existing))
        {
            existing.Name = item.Name;
            existing.Price = item.Price;
        }
    }

    // === InstrumentPrice 仪表价格 ===
    public IReadOnlyList<MachinePrice> InstrumentPrices => _libs.InstrumentPrices ?? new List<MachinePrice>();
    public void AddInstrumentPrice(MachinePrice item)
    {
        (_libs.InstrumentPrices ??= new()).Add(item);
        _instrumentPriceIndex[item.Code] = item;
    }
    public bool RemoveInstrumentPrice(string code)
    {
        var removed = _instrumentPriceIndex.Remove(code);
        if (removed && _libs.InstrumentPrices != null)
            _libs.InstrumentPrices.RemoveAll(m => m.Code == code);
        return removed;
    }
    public MachinePrice? FindInstrumentPrice(string code) => _instrumentPriceIndex.TryGetValue(code, out var m) ? m : null;
    public bool ContainsInstrumentPrice(string code) => _instrumentPriceIndex.ContainsKey(code);
    public void UpdateInstrumentPrice(MachinePrice item)
    {
        if (_instrumentPriceIndex.TryGetValue(item.Code, out var existing))
        {
            existing.Name = item.Name;
            existing.Price = item.Price;
        }
    }

    // === QuotaMachine 定额机械 ===
    public IReadOnlyList<QuotaMachine> QuotaMachines => _libs.QuotaMachines ?? new List<QuotaMachine>();
    public void AddQuotaMachine(QuotaMachine item)
    {
        (_libs.QuotaMachines ??= new()).Add(item);
        _quotaMachineIndex[item.Id ?? ""] = item;
    }
    public bool RemoveQuotaMachine(string id)
    {
        var removed = _quotaMachineIndex.Remove(id);
        if (removed && _libs.QuotaMachines != null)
            _libs.QuotaMachines.RemoveAll(m => m.Id == id);
        return removed;
    }
    public QuotaMachine? FindQuotaMachine(string id) => _quotaMachineIndex.TryGetValue(id, out var m) ? m : null;

    // === QuotaInstrument 定额仪表 ===
    public IReadOnlyList<QuotaMachine> QuotaInstruments => _libs.QuotaInstruments ?? new List<QuotaMachine>();
    public void AddQuotaInstrument(QuotaMachine item)
    {
        (_libs.QuotaInstruments ??= new()).Add(item);
        _quotaInstrumentIndex[item.Id ?? ""] = item;
    }
    public bool RemoveQuotaInstrument(string id)
    {
        var removed = _quotaInstrumentIndex.Remove(id);
        if (removed && _libs.QuotaInstruments != null)
            _libs.QuotaInstruments.RemoveAll(m => m.Id == id);
        return removed;
    }
    public QuotaMachine? FindQuotaInstrument(string id) => _quotaInstrumentIndex.TryGetValue(id, out var m) ? m : null;

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
        RebuildIndexes();
    }
}
