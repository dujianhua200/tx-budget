using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace TxBudget.Core.Engine;

/// <summary>
/// 打折模型（v2，移植自 discount.mjs §6.2）。
/// - DEFAULT_NO_DISCOUNT_KEYS：9 项不打折（合计项联动子项）
/// - DEFAULT_ZERO_AFTER_DISCOUNT_KEYS：11 项措施费折后=0（Q2 裁决 b）
/// - 合计项一律由折后明细加总
/// </summary>
public static class DiscountEngine
{
    public static readonly string[] DefaultNoDiscountKeys =
    {
        "mainMat", "auxMat", "civilFee", "regFee", "socialFee",
        "housingFee", "accidentFee", "sewageFee", "safetyFee",
    };

    public static readonly string[] DefaultZeroAfterDiscountKeys =
    {
        "carryFee", "disturbFee", "tempFee", "nightFee", "winterFee",
        "utilityFee", "specialFee", "protectFee", "earthFee", "dispatchFee", "bigMachineFee",
    };

    public static readonly Dictionary<string, string[]> DiscountParentChildren = new()
    {
        { "mainMat", new[] { "jiaMat", "yiMat" } },
        { "regFee", new[] { "sewageFee", "socialFee", "housingFee", "accidentFee" } },
    };

    /// <summary>
    /// 措施费明细项（measureFee 加总来源）。
    /// </summary>
    public static readonly string[] MeasureLeaves =
    {
        "envFee", "civilFee", "carryFee", "disturbFee", "handoverFee", "tempFee",
        "vehicleFee", "nightFee", "winterFee", "toolFee", "utilityFee", "specialFee",
        "protectFee", "earthFee", "dispatchFee", "bigMachineFee",
    };

    /// <summary>
    /// 表二费用项定义（minimal subset; 移植 methodBefore/methodDiscounted/methodRestored）。
    /// </summary>
    public class LineDef
    {
        public string Key { get; set; } = "";
        public string Label { get; set; } = "";
        public string Kind { get; set; } = "leaf"; // leaf or total
        public string MethodBefore { get; set; } = "";
        public string MethodDiscounted { get; set; } = "";
        public string MethodRestored { get; set; } = "";
    }

    public static readonly LineDef[] DiscountLineDefs = BuildLineDefs();

    private static LineDef[] BuildLineDefs() => new[]
    {
        new LineDef { Key = "techFee", Label = "技工费", Kind = "leaf",
            MethodBefore = "技工总工日X{techPrice}",
            MethodDiscounted = "技工总工日X{techPrice}X{discountPct}%",
            MethodRestored = "技工总工日X{techPrice}/{discountPct}%" },
        new LineDef { Key = "laborFee", Label = "普工费", Kind = "leaf",
            MethodBefore = "普工总工日X{laborPrice}",
            MethodDiscounted = "普工总工日X{laborPrice}X{discountPct}%",
            MethodRestored = "普工总工日X{laborPrice}/{discountPct}%" },
        new LineDef { Key = "laborTotal", Label = "人工费", Kind = "total",
            MethodBefore = "技工费+普工费", MethodDiscounted = "技工费+普工费", MethodRestored = "技工费+普工费" },
        new LineDef { Key = "jiaMat", Label = "甲供材料", Kind = "leaf",
            MethodBefore = "甲供材料费用", MethodDiscounted = "甲供材料费用X{discountPct}%", MethodRestored = "甲供材料费用" },
        new LineDef { Key = "yiMat", Label = "乙供材料", Kind = "leaf",
            MethodBefore = "乙供材料费用", MethodDiscounted = "乙供材料费用X{discountPct}%", MethodRestored = "乙供材料费用" },
        new LineDef { Key = "mainMat", Label = "主要材料费", Kind = "total",
            MethodBefore = "主材费用", MethodDiscounted = "主材费用", MethodRestored = "主材费用" },
        new LineDef { Key = "auxMat", Label = "辅助材料费", Kind = "leaf",
            MethodBefore = "主要材料费X{auxRate}%", MethodDiscounted = "主要材料费X{auxRate}%X{discountPct}%", MethodRestored = "主要材料费X{auxRate}%" },
        new LineDef { Key = "matTotal", Label = "材料费", Kind = "total",
            MethodBefore = "主要材料费+辅助材料费", MethodDiscounted = "主要材料费+辅助材料费", MethodRestored = "主要材料费+辅助材料费" },
        new LineDef { Key = "machineFee", Label = "机械使用费", Kind = "leaf",
            MethodBefore = "机械费合计", MethodDiscounted = "机械费合计X{discountPct}%", MethodRestored = "机械费合计" },
        new LineDef { Key = "instrumentFee", Label = "仪器仪表费", Kind = "leaf",
            MethodBefore = "仪表费合计", MethodDiscounted = "仪表费合计X{discountPct}%", MethodRestored = "仪表费合计" },
        new LineDef { Key = "directFee", Label = "直接工程费", Kind = "total",
            MethodBefore = "1-4之和", MethodDiscounted = "1-4之和", MethodRestored = "1-4之和" },
        new LineDef { Key = "envFee", Label = "环境保护费", Kind = "leaf",
            MethodBefore = "人工费X{envRate}%", MethodDiscounted = "人工费X{envRate}%X{discountPct}%", MethodRestored = "人工费X{envRate}%" },
        new LineDef { Key = "civilFee", Label = "文明施工费", Kind = "leaf",
            MethodBefore = "人工费X{civilRate}%", MethodDiscounted = "人工费X{civilRate}%X{discountPct}%", MethodRestored = "人工费X{civilRate}%/{discountPct}%" },
        new LineDef { Key = "carryFee", Label = "工地器材搬运费", Kind = "leaf",
            MethodBefore = "人工费X{carryRate}%", MethodDiscounted = "人工费X{carryRate}%X{discountPct}%", MethodRestored = "人工费X{carryRate}%" },
        new LineDef { Key = "disturbFee", Label = "工程干扰费", Kind = "leaf",
            MethodBefore = "人工费X{disturbRate}%", MethodDiscounted = "人工费X{disturbRate}%X{discountPct}%", MethodRestored = "人工费X{disturbRate}%" },
        new LineDef { Key = "handoverFee", Label = "工程点交、场地清理费", Kind = "leaf",
            MethodBefore = "人工费X{handoverRate}%", MethodDiscounted = "人工费X{handoverRate}%", MethodRestored = "人工费X{handoverRate}%" },
        new LineDef { Key = "tempFee", Label = "临时设施费", Kind = "leaf",
            MethodBefore = "人工费X{tempRate}%", MethodDiscounted = "人工费X{tempRate}%X{discountPct}%", MethodRestored = "人工费X{tempRate}%/{discountPct}%" },
        new LineDef { Key = "vehicleFee", Label = "工程车辆使用费", Kind = "leaf",
            MethodBefore = "人工费X{vehicleRate}%", MethodDiscounted = "人工费X{vehicleRate}%", MethodRestored = "人工费X{vehicleRate}%" },
        new LineDef { Key = "nightFee", Label = "夜间施工增加费", Kind = "leaf",
            MethodBefore = "人工费X{nightRate}%", MethodDiscounted = "人工费X{nightRate}%X{discountPct}%", MethodRestored = "人工费X{nightRate}%" },
        new LineDef { Key = "winterFee", Label = "冬雨季施工增加费", Kind = "leaf",
            MethodBefore = "人工费X{winterRate}%", MethodDiscounted = "人工费X{winterRate}%X{discountPct}%", MethodRestored = "人工费X{winterRate}%" },
        new LineDef { Key = "toolFee", Label = "生产工具用具使用费", Kind = "leaf",
            MethodBefore = "人工费X{toolRate}%", MethodDiscounted = "人工费X{toolRate}%", MethodRestored = "人工费X{toolRate}%" },
        new LineDef { Key = "utilityFee", Label = "施工用水电蒸汽费", Kind = "leaf",
            MethodBefore = "人工费X{utilityRate}%", MethodDiscounted = "人工费X{utilityRate}%X{discountPct}%", MethodRestored = "人工费X{utilityRate}%" },
        new LineDef { Key = "specialFee", Label = "特殊地区施工增加费", Kind = "leaf",
            MethodBefore = "工日X8X0", MethodDiscounted = "工日X8X0X{discountPct}%", MethodRestored = "工日X8X0" },
        new LineDef { Key = "protectFee", Label = "已完工程及设备保护费", Kind = "leaf",
            MethodBefore = "人工费X{protectRate}%", MethodDiscounted = "人工费X{protectRate}%X{discountPct}%", MethodRestored = "人工费X{protectRate}%" },
        new LineDef { Key = "earthFee", Label = "运土费", Kind = "leaf",
            MethodBefore = "运土费", MethodDiscounted = "运土费X{discountPct}%", MethodRestored = "运土费" },
        new LineDef { Key = "dispatchFee", Label = "施工队伍调遣费", Kind = "leaf",
            MethodBefore = "调遣单价X人数X2", MethodDiscounted = "调遣单价X人数X2X{discountPct}%", MethodRestored = "调遣单价X人数X2" },
        new LineDef { Key = "bigMachineFee", Label = "大型施工机械调遣费", Kind = "leaf",
            MethodBefore = "大型施工机械调遣费", MethodDiscounted = "大型施工机械调遣费X{discountPct}%", MethodRestored = "大型施工机械调遣费" },
        new LineDef { Key = "measureFee", Label = "措施项目费", Kind = "total",
            MethodBefore = "1-15之和", MethodDiscounted = "1-15之和", MethodRestored = "1-15之和" },
        new LineDef { Key = "directTotal", Label = "直接费", Kind = "total",
            MethodBefore = "(一)+(二)", MethodDiscounted = "(一)+(二)", MethodRestored = "(一)+(二)" },
        new LineDef { Key = "sewageFee", Label = "工程排污费", Kind = "leaf",
            MethodBefore = "工程排污费", MethodDiscounted = "工程排污费X{discountPct}%", MethodRestored = "工程排污费" },
        new LineDef { Key = "socialFee", Label = "社会保障费", Kind = "leaf",
            MethodBefore = "人工费X{socialRate}%", MethodDiscounted = "人工费X{socialRate}%", MethodRestored = "人工费X{socialRate}%" },
        new LineDef { Key = "housingFee", Label = "住房公积金", Kind = "leaf",
            MethodBefore = "人工费X{housingRate}%", MethodDiscounted = "人工费X{housingRate}%", MethodRestored = "人工费X{housingRate}%" },
        new LineDef { Key = "accidentFee", Label = "危险作业意外伤害保险费", Kind = "leaf",
            MethodBefore = "人工费X{accidentRate}%", MethodDiscounted = "人工费X{accidentRate}%", MethodRestored = "人工费X{accidentRate}%" },
        new LineDef { Key = "regFee", Label = "规费", Kind = "total",
            MethodBefore = "1-4之和", MethodDiscounted = "1-4之和", MethodRestored = "(1-4之和)/{discountPct}%" },
        new LineDef { Key = "mgmtFee", Label = "企业管理费", Kind = "leaf",
            MethodBefore = "人工费X{mgmtRate}%", MethodDiscounted = "人工费X{mgmtRate}%", MethodRestored = "人工费X{mgmtRate}%" },
        new LineDef { Key = "indirectTotal", Label = "间接费", Kind = "total",
            MethodBefore = "(一)+(二)", MethodDiscounted = "(一)+(二)", MethodRestored = "(一)+(二)" },
        new LineDef { Key = "profit", Label = "利润", Kind = "leaf",
            MethodBefore = "人工费X{profitRate}%", MethodDiscounted = "人工费X{profitRate}%", MethodRestored = "人工费X{profitRate}%" },
        new LineDef { Key = "exclTax", Label = "建筑安装工程费（除税价）", Kind = "total",
            MethodBefore = "一+二+三", MethodDiscounted = "一+二+三", MethodRestored = "一+二+三" },
        new LineDef { Key = "outputTax", Label = "销项税额", Kind = "total",
            MethodBefore = "销项税额", MethodDiscounted = "销项税额", MethodRestored = "销项税额" },
        new LineDef { Key = "inclTax", Label = "建筑安装工程费（含税价）", Kind = "total",
            MethodBefore = "一+二+三+四", MethodDiscounted = "一+二+三+四", MethodRestored = "一+二+三+四" },
    };

    private static readonly HashSet<string> LeafKeys = new(
        DiscountLineDefs.Where(d => d.Kind == "leaf").Select(d => d.Key));

    private static readonly HashSet<string> DefKeys = new(
        DiscountLineDefs.Select(d => d.Key));

    /// <summary>
    /// 渲染方法列模板：替换 {占位符}。
    /// </summary>
    public static string RenderMethodText(LineDef def, string mode, Dictionary<string, object>? vars = null)
    {
        var tpl = mode switch
        {
            "restored" => def.MethodRestored,
            "before" => def.MethodBefore,
            _ => def.MethodDiscounted,
        };
        if (string.IsNullOrEmpty(tpl)) return "";
        return Regex.Replace(tpl, @"\{(\w+)\}", m =>
        {
                var k = m.Groups[1].Value;
                if (k == "discountPct")
                {
                    if (vars != null && vars.TryGetValue("discountRate", out var rObj) && rObj is decimal rDec)
                    {
                        return ((rDec * 100m).ToString("0.####", System.Globalization.CultureInfo.InvariantCulture));
                    }
                    return "{discountPct}";
                }
                if (vars != null && vars.TryGetValue(k, out var vObj))
                {
                    return vObj?.ToString() ?? $"{{{k}}}";
                }
                return $"{{{k}}}";
            });
    }

    /// <summary>
    /// 逐项打折：table2Before → table2After。
    /// </summary>
    public static Dictionary<string, decimal> ApplyDiscount(
        Dictionary<string, decimal> before,
        decimal discountRate,
        IReadOnlyList<string>? noDiscountKeys = null,
        IReadOnlyList<string>? zeroAfterDiscountKeys = null,
        decimal? outputTaxRate = null,
        decimal? jiaTax = null)
    {
        if (discountRate <= 0m || discountRate > 1m)
        {
            throw new ArgumentException($"折扣率非法：{discountRate}（取值范围 (0,1]）");
        }
        var src = before ?? new Dictionary<string, decimal>();
        var noDisc = new HashSet<string>(noDiscountKeys ?? DefaultNoDiscountKeys);
        var zeroDisc = new HashSet<string>(zeroAfterDiscountKeys ?? DefaultZeroAfterDiscountKeys);

        // 合计项 key 联动子项。
        foreach (var kv in DiscountParentChildren)
        {
            if (noDisc.Contains(kv.Key))
                foreach (var c in kv.Value) noDisc.Add(c);
        }

        var after = new Dictionary<string, decimal>();

        // 明细项：折扣率 < 1 且 ∈ zeroAfterDiscountKeys 则折后 = 0；∈ noDiscountKeys 则保持；否则 × 折扣率。
        var leafKeys = new HashSet<string>(LeafKeys);
        foreach (var k in src.Keys)
        {
            if (!DefKeys.Contains(k)
                && !k.Equals("dispatchUnit", StringComparison.Ordinal)
                && !k.Equals("dispatchPeople", StringComparison.Ordinal))
            {
                leafKeys.Add(k);
            }
        }
        foreach (var k in leafKeys)
        {
            var v = src.TryGetValue(k, out var sv) ? sv : 0m;
            if (discountRate < 1m && zeroDisc.Contains(k))
            {
                after[k] = 0m;
            }
            else
            {
                after[k] = noDisc.Contains(k) ? R2(v) : R2(v * discountRate);
            }
        }

        // 合计项：由折后明细加总。
        after["laborTotal"] = R2(GetVal(after, "techFee") + GetVal(after, "laborFee"));
        after["mainMat"] = R2(GetVal(after, "jiaMat") + GetVal(after, "yiMat"));
        after["matTotal"] = R2(GetVal(after, "mainMat") + GetVal(after, "auxMat"));
        after["directFee"] = R2(GetVal(after, "laborTotal") + GetVal(after, "matTotal")
            + GetVal(after, "machineFee") + GetVal(after, "instrumentFee"));
        after["measureFee"] = R2(MeasureLeaves.Sum(k => GetVal(after, k)));
        after["directTotal"] = R2(GetVal(after, "directFee") + GetVal(after, "measureFee"));
        after["regFee"] = R2(GetVal(after, "sewageFee") + GetVal(after, "socialFee")
            + GetVal(after, "housingFee") + GetVal(after, "accidentFee"));
        after["indirectTotal"] = R2(GetVal(after, "regFee") + GetVal(after, "mgmtFee"));
        after["exclTax"] = R2(GetVal(after, "directTotal") + GetVal(after, "indirectTotal") + GetVal(after, "profit"));

        // 销项税额：基数取折后值。
        if (outputTaxRate.HasValue && jiaTax.HasValue)
        {
            var jiaMat = GetVal(after, "jiaMat");
            var exclTax = GetVal(after, "exclTax");
            after["outputTax"] = R2((exclTax - jiaMat) * outputTaxRate.Value + jiaMat * jiaTax.Value);
        }
        else
        {
            after["outputTax"] = R2(src.TryGetValue("outputTax", out var ot) ? ot : 0m);
        }
        after["inclTax"] = R2(GetVal(after, "exclTax") + GetVal(after, "outputTax"));

        // 信息项原样透传。
        after["dispatchUnit"] = src.TryGetValue("dispatchUnit", out var du) ? du : 0m;
        after["dispatchPeople"] = src.TryGetValue("dispatchPeople", out var dp) ? dp : 0m;
        return after;
    }

    private static decimal GetVal(Dictionary<string, decimal> d, string k) =>
        d.TryGetValue(k, out var v) ? v : 0m;

    /// <summary>
    /// 与 JS r2() 等价：Math.round((x + ε) × 100) / 100
    /// .NET decimal 提供 MidpointRounding.AwayFromZero，与 Excel 一致。
    /// </summary>
    public static decimal R2(decimal x)
    {
        return Math.Round(x, 2, MidpointRounding.AwayFromZero);
    }
}