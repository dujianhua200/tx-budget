using System.Collections.Generic;

namespace TxBudget.Core.Engine;

/// <summary>
/// 具名费率模型（v2，移植自 rates.mjs §2.2.1、§10 B8）。
/// PROJECT_TYPES 顺序与 calc.mjs 一致。
/// </summary>
public static class RateResolver
{
    public static readonly string[] ProjectTypes =
    {
        "无线通信设备安装工程",
        "通信电源设备安装工程",
        "有线通信设备安装工程",
        "通信线路工程",
        "通信管道工程",
    };

    public class RateFieldDef
    {
        public string Key { get; set; } = "";
        public string Name { get; set; } = "";
        public string Unit { get; set; } = "";
        public int GridN { get; set; }
    }

    public static readonly RateFieldDef[] RateFieldDefs =
    {
        new() { Key = "techPrice", Name = "技工费", Unit = "元/工日", GridN = 3 },
        new() { Key = "laborPrice", Name = "普工费", Unit = "元/工日", GridN = 4 },
        new() { Key = "auxRate", Name = "辅材费率", Unit = "费率", GridN = 5 },
        new() { Key = "envRate", Name = "环境保护费费", Unit = "费率", GridN = 6 },
        new() { Key = "civilRate", Name = "文明施工费", Unit = "费率", GridN = 7 },
        new() { Key = "carryRate", Name = "工地器材搬运费", Unit = "费率", GridN = 8 },
        new() { Key = "disturbRate", Name = "工程干扰费", Unit = "费率", GridN = 9 },
        new() { Key = "handoverRate", Name = "工程点交、场地清理费", Unit = "费率", GridN = 10 },
        new() { Key = "tempNearRate", Name = "临时设施费(35km以内)", Unit = "费率", GridN = 11 },
        new() { Key = "tempFarRate", Name = "临时设施费(35km以上)", Unit = "费率", GridN = 12 },
        new() { Key = "vehicleRate", Name = "工程车辆使用费", Unit = "费率", GridN = 13 },
        new() { Key = "nightRate", Name = "夜间施工增加费", Unit = "费率", GridN = 14 },
        new() { Key = "winterRate", Name = "冬雨季施工增加费", Unit = "费率（null=按地区查表）", GridN = 15 },
        new() { Key = "toolRate", Name = "生产工具用具使用费", Unit = "费率", GridN = 16 },
        new() { Key = "utilityRate", Name = "施工用水电蒸汽费", Unit = "费率", GridN = 17 },
        new() { Key = "protectRate", Name = "已完成工程及设备保护费", Unit = "费率", GridN = 19 },
        new() { Key = "socialRate", Name = "社会保障金", Unit = "费率", GridN = 21 },
        new() { Key = "housingRate", Name = "住房公积金", Unit = "费率", GridN = 22 },
        new() { Key = "accidentRate", Name = "危险作业意外伤害保险费", Unit = "费率", GridN = 23 },
        new() { Key = "mgmtRate", Name = "企业管理费", Unit = "费率", GridN = 24 },
        new() { Key = "profitRate", Name = "利润率", Unit = "费率", GridN = 25 },
    };

    private static decimal NumOr(decimal? v, decimal fallback) => v ?? fallback;

    /// <summary>
    /// 具名费率读取：缺失返回 null。
    /// </summary>
    public static decimal? RateForNamed(RatesBlob rates, string projectType, string key)
    {
        if (rates?.ByProjectType == null) return null;
        if (!rates.ByProjectType.TryGetValue(projectType, out var row)) return null;
        if (row == null) return null;
        if (key == "winterRate")
        {
            return row.WinterRate;
        }
        return row.GetRate(key);
    }

    /// <summary>
    /// 冬雨季费率：winterRate 非 null 直接用；null 则按地区查 winterTable。
    /// </summary>
    public static decimal WinterRateForNamed(RatesBlob rates, string projectType, string region)
    {
        if (rates?.ByProjectType == null || !rates.ByProjectType.TryGetValue(projectType, out var row) || row == null)
        {
            return 0m;
        }
        if (row.WinterRate.HasValue) return row.WinterRate.Value;
        if (rates.WinterTable != null && rates.WinterTable.TryGetValue(region ?? "", out var v))
        {
            return v;
        }
        return 0m;
    }

    /// <summary>
    /// 把具名 rates 合并成引擎使用的 dict（含全部规则口 + winterRate + jiaTax/yiTax/outputTax/taxRate）。
    /// </summary>
    public static Dictionary<string, decimal> ResolveNamedRates(RatesBlob? rates, string projectType, string region)
    {
        var result = new Dictionary<string, decimal>();
        if (rates?.ByProjectType == null || !rates.ByProjectType.TryGetValue(projectType, out var row) || row == null)
        {
            foreach (var def in RateFieldDefs) result[def.Key] = 0m;
            result["winterRate"] = 0m;
            return result;
        }
        foreach (var def in RateFieldDefs)
        {
            if (def.Key == "winterRate") continue;
            var v = row.GetRate(def.Key);
            result[def.Key] = v ?? 0m;
        }
        result["winterRate"] = WinterRateForNamed(rates, projectType, region);
        return result;
    }
}

/// <summary>
/// 费率 blob（rates.mjs 中 rateGridToRates(rateGrid) 输出 + winterTable）。
/// </summary>
public class RatesBlob
{
    public Dictionary<string, NamedRateRow>? ByProjectType { get; set; }
    public Dictionary<string, decimal>? WinterTable { get; set; }
    public VatRates? VatRates { get; set; }
}

public class NamedRateRow
{
    public decimal? TechPrice { get; set; }
    public decimal? LaborPrice { get; set; }
    public decimal? AuxRate { get; set; }
    public decimal? EnvRate { get; set; }
    public decimal? CivilRate { get; set; }
    public decimal? CarryRate { get; set; }
    public decimal? DisturbRate { get; set; }
    public decimal? HandoverRate { get; set; }
    public decimal? TempNearRate { get; set; }
    public decimal? TempFarRate { get; set; }
    public decimal? VehicleRate { get; set; }
    public decimal? NightRate { get; set; }
    public decimal? WinterRate { get; set; }
    public decimal? ToolRate { get; set; }
    public decimal? UtilityRate { get; set; }
    public decimal? ProtectRate { get; set; }
    public decimal? SocialRate { get; set; }
    public decimal? HousingRate { get; set; }
    public decimal? AccidentRate { get; set; }
    public decimal? MgmtRate { get; set; }
    public decimal? ProfitRate { get; set; }

    public decimal? GetRate(string key)
    {
        return key switch
        {
            "techPrice" => TechPrice,
            "laborPrice" => LaborPrice,
            "auxRate" => AuxRate,
            "envRate" => EnvRate,
            "civilRate" => CivilRate,
            "carryRate" => CarryRate,
            "disturbRate" => DisturbRate,
            "handoverRate" => HandoverRate,
            "tempNearRate" => TempNearRate,
            "tempFarRate" => TempFarRate,
            "vehicleRate" => VehicleRate,
            "nightRate" => NightRate,
            "winterRate" => WinterRate,
            "toolRate" => ToolRate,
            "utilityRate" => UtilityRate,
            "protectRate" => ProtectRate,
            "socialRate" => SocialRate,
            "housingRate" => HousingRate,
            "accidentRate" => AccidentRate,
            "mgmtRate" => MgmtRate,
            "profitRate" => ProfitRate,
            _ => null,
        };
    }
}