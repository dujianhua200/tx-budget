using System.Text.Json;
using TxBudget.Core.Engine;
using TxBudget.Core.Model;

namespace TxBudget.Core.Tests;

/// <summary>
/// 测试基类：加载 seed.json 与 lo_values.json，提供标准 libs 装配与帮助函数。
/// </summary>
public abstract class TestBase
{
    protected LibrarySet Libs { get; private set; } = new();
    protected LibrarySet LibsWithWinterTable { get; private set; } = new();
    protected Dictionary<string, decimal> LoValues { get; private set; } = new();

    protected TestBase()
    {
        LoadLibs();
        LoadLoValues();
    }

    private void LoadLibs()
    {
        var seedPath = Path.Combine(AppContext.BaseDirectory, "fixtures", "seed.json");
        var json = File.ReadAllText(seedPath);
        var seed = JsonSerializer.Deserialize<JsonElement>(json);

        var libs = new LibrarySet
        {
            Quotas = ReadQuotaList(seed.GetProperty("quotas")),
            Materials = new List<Material>(),
            Rules = ReadRuleList(seed.GetProperty("rules")),
            MachinePrices = ReadMachineList(seed.GetProperty("machinePrices"), "machinePrices"),
            InstrumentPrices = ReadMachineList(seed.GetProperty("instrumentPrices"), "instrumentPrices"),
            QuotaMachines = ReadQuotaMachineList(seed.GetProperty("quotaMachines")),
            QuotaInstruments = ReadQuotaMachineList(seed.GetProperty("quotaInstruments")),
            Dispatch = Dispatch.Default(),
        };

        // materials_jia / materials_yi / materials_equip
        foreach (var arrName in new[] { "materials_jia", "materials_yi", "materials_equip" })
        {
            var supply = arrName switch
            {
                "materials_jia" => "甲供",
                "materials_yi" => "乙供",
                "materials_equip" => "设备",
                _ => "",
            };
            foreach (var m in seed.GetProperty(arrName).EnumerateArray())
            {
                libs.Materials.Add(new Material
                {
                    Name = m.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "",
                    Spec = m.TryGetProperty("spec", out var s) ? s.GetString() ?? "" : "",
                    Unit = m.TryGetProperty("unit", out var u) ? u.GetString() ?? "" : "",
                    PriceExcl = TryDecimal(m, "priceExcl"),
                    Supply = supply,
                });
            }
        }

        // rates: rateGrid → 具名 rates
        if (seed.TryGetProperty("rateGrid", out var rg))
        {
            libs.Rates = BuildRatesFromGrid(rg);
        }
        if (seed.TryGetProperty("winterTable", out var wt))
        {
            libs.WinterTable = new Dictionary<string, decimal>();
            foreach (var kv in wt.EnumerateObject())
            {
                libs.WinterTable[kv.Name] = kv.Value.GetDecimal();
            }
        }
        if (libs.WinterTable != null)
        {
            libs.Rates ??= new RatesBlob();
            libs.Rates.WinterTable = libs.WinterTable;
        }

        Libs = libs;
        LibsWithWinterTable = libs;
    }

    private void LoadLoValues()
    {
        var loPath = Path.Combine(AppContext.BaseDirectory, "fixtures", "lo_values.json");
        var json = File.ReadAllText(loPath);
        var doc = JsonSerializer.Deserialize<JsonElement>(json);
        LoValues = new Dictionary<string, decimal>();
        foreach (var prop in doc.EnumerateObject())
        {
            if (prop.Value.ValueKind == JsonValueKind.Number)
            {
                LoValues[prop.Name] = prop.Value.GetDecimal();
            }
        }
    }

    private List<Quota> ReadQuotaList(JsonElement arr)
    {
        var list = new List<Quota>();
        foreach (var q in arr.EnumerateArray())
        {
            list.Add(new Quota
            {
                Code = q.TryGetProperty("code", out var c) ? c.GetString() ?? "" : "",
                Name = q.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "",
                Unit = q.TryGetProperty("unit", out var u) ? u.GetString() ?? "" : "",
                Tech = TryDecimal(q, "tech"),
                Labor = TryDecimal(q, "labor"),
                Coef = TryDecimal(q, "coef"),
                Book = q.TryGetProperty("book", out var b) ? b.GetString() : null,
                Alias = q.TryGetProperty("alias", out var a) ? a.GetString() : null,
            });
        }
        return list;
    }

    private List<MaterialRule> ReadRuleList(JsonElement arr)
    {
        var list = new List<MaterialRule>();
        int idx = 0;
        foreach (var r in arr.EnumerateArray())
        {
            list.Add(new MaterialRule
            {
                Id = $"r{idx++}",
                Quota = r.TryGetProperty("quota", out var q) ? q.GetString() ?? "" : "",
                Material = r.TryGetProperty("material", out var m) ? m.GetString() ?? "" : "",
                Spec = r.TryGetProperty("spec", out var s) ? s.GetString() ?? "" : "",
                Kind = r.TryGetProperty("kind", out var k) ? k.GetString() ?? "" : "",
                Variant = r.TryGetProperty("variant", out var v) ? v.GetString() : null,
                Consumption = TryDecimal(r, "consumption"),
                Supply = r.TryGetProperty("supply", out var sup) ? sup.GetString() : null,
            });
        }
        return list;
    }

    private List<MachinePrice> ReadMachineList(JsonElement arr, string _)
    {
        var list = new List<MachinePrice>();
        foreach (var m in arr.EnumerateArray())
        {
            list.Add(new MachinePrice
            {
                Code = m.TryGetProperty("code", out var c) ? c.GetString() ?? "" : "",
                Name = m.TryGetProperty("name", out var n) ? n.GetString() : null,
                Price = TryDecimal(m, "price") ?? 0m,
            });
        }
        return list;
    }

    private List<QuotaMachine> ReadQuotaMachineList(JsonElement arr)
    {
        var list = new List<QuotaMachine>();
        foreach (var m in arr.EnumerateArray())
        {
            list.Add(new QuotaMachine
            {
                Quota = m.TryGetProperty("quota", out var q) ? q.GetString() ?? "" : "",
                MCode = m.TryGetProperty("mcode", out var mc) ? mc.GetString() ?? "" : "",
                MName = m.TryGetProperty("mname", out var mn) ? mn.GetString() : null,
                Unit = m.TryGetProperty("unit", out var u) ? u.GetString() : null,
                Qty = TryDecimal(m, "qty"),
            });
        }
        return list;
    }

    private static decimal? TryDecimal(JsonElement e, string name)
    {
        if (!e.TryGetProperty(name, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number) return v.GetDecimal();
        if (v.ValueKind == JsonValueKind.String && decimal.TryParse(v.GetString(), out var d)) return d;
        return null;
    }

    /// <summary>
    /// 从 rateGrid 构造具名 rates（与 JS rateGridToRates 行为一致）。
    /// </summary>
    private static RatesBlob BuildRatesFromGrid(JsonElement rg)
    {
        var blob = new RatesBlob { ByProjectType = new Dictionary<string, NamedRateRow>() };
        // rg 是 85 行 × 34 列的二维数组
        var rows = new List<List<decimal?>>();
        foreach (var r in rg.EnumerateArray())
        {
            var row = new List<decimal?>();
            foreach (var c in r.EnumerateArray())
            {
                if (c.ValueKind == JsonValueKind.Number)
                {
                    row.Add(c.GetDecimal());
                }
                else
                {
                    row.Add(null);
                }
            }
            rows.Add(row);
        }
        for (int col = 0; col < RateResolver.ProjectTypes.Length; col++)
        {
            var named = new NamedRateRow();
            foreach (var def in RateResolver.RateFieldDefs)
            {
                var gridRow = rows.Count > def.GridN + 1 ? rows[def.GridN + 1] : null;
                decimal? v = null;
                if (gridRow != null && gridRow.Count > 6 + col)
                {
                    v = gridRow[6 + col];
                }
                SetNamedRate(named, def.Key, def.Key == "winterRate" ? null : (v ?? 0m));
            }
            blob.ByProjectType[RateResolver.ProjectTypes[col]] = named;
        }
        return blob;
    }

    private static void SetNamedRate(NamedRateRow row, string key, decimal? value)
    {
        switch (key)
        {
            case "techPrice": row.TechPrice = value; break;
            case "laborPrice": row.LaborPrice = value; break;
            case "auxRate": row.AuxRate = value; break;
            case "envRate": row.EnvRate = value; break;
            case "civilRate": row.CivilRate = value; break;
            case "carryRate": row.CarryRate = value; break;
            case "disturbRate": row.DisturbRate = value; break;
            case "handoverRate": row.HandoverRate = value; break;
            case "tempNearRate": row.TempNearRate = value; break;
            case "tempFarRate": row.TempFarRate = value; break;
            case "vehicleRate": row.VehicleRate = value; break;
            case "nightRate": row.NightRate = value; break;
            case "winterRate": row.WinterRate = null; break; // 强制 null = 查表
            case "toolRate": row.ToolRate = value; break;
            case "utilityRate": row.UtilityRate = value; break;
            case "protectRate": row.ProtectRate = value; break;
            case "socialRate": row.SocialRate = value; break;
            case "housingRate": row.HousingRate = value; break;
            case "accidentRate": row.AccidentRate = value; break;
            case "mgmtRate": row.MgmtRate = value; break;
            case "profitRate": row.ProfitRate = value; break;
        }
    }
}