using System.Collections.Generic;

namespace TxBudget.Core.Engine;

/// <summary>
/// 调遣费参数（移植自 profiles.js DEFAULT_DISPATCH）。
/// </summary>
public class Dispatch
{
    public List<(decimal threshold, decimal value)> PriceTable { get; set; } = new();
    public List<(decimal threshold, decimal value)> PeopleEquip { get; set; } = new();
    public List<(decimal threshold, decimal value)> PeopleLine { get; set; } = new();
    public decimal ExtraPer200km { get; set; } = 48m;
    public decimal ExtraPeopleStep { get; set; } = 3m;

    public static Dispatch Default() => new()
    {
        PriceTable = new List<(decimal, decimal)>
        {
            (0m, 0m), (35.0001m, 141m), (100.0001m, 174m), (200.0001m, 240m),
            (400.0001m, 295m), (600.0001m, 356m), (800.0001m, 372m),
            (1000.0001m, 417m), (1200.0001m, 565m), (1400.0001m, 598m), (1600.0001m, 634m),
        },
        PeopleEquip = new List<(decimal, decimal)>
        {
            (0m, 5m), (500.0001m, 10m), (1000.0001m, 17m),
            (2000.0001m, 24m), (3000.0001m, 30m), (4000.0001m, 35m),
        },
        PeopleLine = new List<(decimal, decimal)>
        {
            (0m, 5m), (500.0001m, 10m), (1000.0001m, 17m),
            (2000.0001m, 24m), (3000.0001m, 30m), (4000.0001m, 35m),
            (5000.0001m, 40m), (6000.0001m, 45m), (7000.0001m, 50m),
            (8000.0001m, 55m), (9000.0001m, 60m), (10000.0001m, 80m),
            (15000.0001m, 95m), (20000.0001m, 105m), (25000.0001m, 120m),
        },
        ExtraPer200km = 48m,
        ExtraPeopleStep = 3m,
    };
}

/// <summary>
/// 增值税率（rates.vatRates，§2.4 取值优先级）。
/// </summary>
public class VatRates
{
    public decimal? JiaTax { get; set; }
    public decimal? YiTax { get; set; }
    public decimal? OutputTax { get; set; }
    public decimal? SafetyVat { get; set; }
}

public class DiscountRule
{
    public decimal? DiscountRate { get; set; }
    public List<string>? NoDiscountKeys { get; set; }
    public List<string>? ZeroAfterDiscountKeys { get; set; }
}

public class RateOverrides
{
    public decimal? Discount { get; set; }
    public decimal? JiaTax { get; set; }
    public decimal? YiTax { get; set; }
    public decimal? TaxRate { get; set; }
    public decimal? OutputTax { get; set; }
    public decimal? SafetyVat { get; set; }
}

/// <summary>
/// 表五费用项配置（profiles.js DEFAULT_TABLE5_FEES，§7.3）。
/// </summary>
public class Table5Config
{
    public class Table5Fee
    {
        public string Key { get; set; } = "";
        public string Name { get; set; } = "";
        public string Basis { get; set; } = "";
        public decimal? Rate { get; set; }
        public decimal? VatRate { get; set; }
        public decimal? Amount { get; set; }
        public bool Enabled { get; set; } = true;
        public decimal Order { get; set; }
        public string Note { get; set; } = "";
        public List<string>? Children { get; set; }
    }

    public static List<Table5Fee> DefaultFees() => new()
    {
        new() { Key = "landFee", Name = "建设用地及综合赔补费", Basis = "manual", Rate = 0m, VatRate = 0m, Enabled = true, Order = 1m, Note = "默认空值" },
        new() { Key = "mgmt2", Name = "项目建设管理费", Basis = "preDiscountExclTax", Rate = 0.02m, VatRate = 0.06m, Enabled = true, Order = 2m, Note = "v1 公式保留" },
        new() { Key = "feasibilityFee", Name = "可行性研究费", Basis = "manual", Rate = 0m, VatRate = 0m, Enabled = true, Order = 3m, Note = "默认空值" },
        new() { Key = "researchFee", Name = "研究试验费", Basis = "manual", Rate = 0m, VatRate = 0m, Enabled = true, Order = 4m, Note = "默认空值" },
        new() { Key = "designTotal", Name = "勘察设计费", Basis = "sum", VatRate = 0.06m, Enabled = true, Order = 5m, Note = "5.1+5.2 之和，不独立取费", Children = new() { "surveyFee", "designFee" } },
        new() { Key = "surveyFee", Name = "其中：勘察费", Basis = "surveyKm", VatRate = 0.06m, Enabled = true, Order = 5.1m, Note = "v1 分段公式保留" },
        new() { Key = "designFee", Name = "其中：设计费", Basis = "preDiscountExclTax", Rate = 0.0495m, VatRate = 0.06m, Enabled = true, Order = 5.2m, Note = "exclTax × 0.045 × 1.1" },
        new() { Key = "envEvalFee", Name = "环境影响评价费", Basis = "manual", Rate = 0m, VatRate = 0m, Enabled = true, Order = 6m, Note = "默认空值" },
        new() { Key = "supervisionFee", Name = "建设工程监理费", Basis = "manual", Rate = 0m, VatRate = 0m, Enabled = true, Order = 7m, Note = "默认空值" },
        new() { Key = "safetyFee", Name = "安全生产费", Basis = "preDiscountExclTax", Rate = 0.02m, VatRate = 0m, Enabled = true, Order = 8m, Note = "财资〔2022〕136号，通信工程 2%，增值税 0" },
        new() { Key = "importTechFee", Name = "引进技术及进口设备其他费", Basis = "manual", Rate = 0m, VatRate = 0m, Enabled = true, Order = 9m, Note = "默认空值" },
        new() { Key = "insuranceFee", Name = "工程保险费", Basis = "manual", Rate = 0m, VatRate = 0m, Enabled = true, Order = 10m, Note = "默认空值" },
        new() { Key = "tenderFee", Name = "工程招标代理费", Basis = "manual", Rate = 0m, VatRate = 0m, Enabled = true, Order = 11m, Note = "默认空值" },
        new() { Key = "patentFee", Name = "专利及专利技术使用费", Basis = "manual", Rate = 0m, VatRate = 0m, Enabled = true, Order = 12m, Note = "默认空值" },
        new() { Key = "otherFee", Name = "其他费用", Basis = "manual", Rate = 0m, VatRate = 0m, Enabled = true, Order = 13m, Note = "默认空值" },
        new() { Key = "productionPrepFee", Name = "生产准备及开办费(运营费)", Basis = "manual", Rate = 0m, VatRate = 0m, Enabled = true, Order = 14m, Note = "总计之后单独行，不计入总计" },
    };
}