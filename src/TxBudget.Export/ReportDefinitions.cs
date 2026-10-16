using TxBudget.Core.Engine;

namespace TxBudget.Export;

/// <summary>
/// 报表定义：22+ 种报表类型。
/// </summary>
public static class ReportDefinitions
{
    public class ReportDef
    {
        public string Key { get; set; } = "";
        public string Name { get; set; } = "";
        public string Category { get; set; } = "";
        public string Description { get; set; } = "";
        /// <summary>该报表是否可导出为 Excel</summary>
        public bool SupportsExcel { get; set; } = true;
        /// <summary>该报表是否可导出为 PDF</summary>
        public bool SupportsPdf { get; set; } = false;
    }

    public static readonly List<ReportDef> AllReports = new()
    {
        // 表一 ~ 表五
        new() { Key = "Table1", Name = "表一 建设项目总费用", Category = "主表", Description = "建设项目总费用表（建安费+其他费）" },
        new() { Key = "Table2", Name = "表二 建筑安装工程费", Category = "主表", Description = "建筑安装工程费用明细（折后）" },
        new() { Key = "Table2Before", Name = "表二（折前）", Category = "主表", Description = "建筑安装工程费用明细（折扣前）" },
        new() { Key = "Table3A", Name = "表三A 建筑安装工程量（定额工日）", Category = "主表", Description = "定额工日汇总" },
        new() { Key = "Table3B", Name = "表三B 机械使用费", Category = "主表", Description = "机械台班及费用" },
        new() { Key = "Table3C", Name = "表三C 仪器仪表费", Category = "主表", Description = "仪器仪表台班及费用" },
        new() { Key = "Table4A", Name = "表四A 甲供材料", Category = "主表", Description = "甲供材料用量及费用" },
        new() { Key = "Table4B", Name = "表四B 乙供材料", Category = "主表", Description = "乙供材料用量及费用" },
        new() { Key = "Table4Equip", Name = "表四 设备材料", Category = "主表", Description = "设备材料用量及费用" },
        new() { Key = "Table5", Name = "表五 其他费用", Category = "主表", Description = "其他建设费用明细" },

        // 汇总与明细
        new() { Key = "Summary", Name = "费用汇总", Category = "汇总", Description = "建安费/其他费/总计汇总" },
        new() { Key = "RateDetail", Name = "费率明细", Category = "汇总", Description = "各项费率取值明细" },
        new() { Key = "LaborDetail", Name = "人工费明细", Category = "汇总", Description = "技工/普工/人工费汇总" },
        new() { Key = "MaterialDetail", Name = "材料费明细", Category = "汇总", Description = "甲供/乙供/辅助材料汇总" },
        new() { Key = "MeasureDetail", Name = "措施费明细", Category = "汇总", Description = "措施项目费明细" },
        new() { Key = "IndirectDetail", Name = "间接费明细", Category = "汇总", Description = "规费/企业管理费/间接费汇总" },
        new() { Key = "DirectDetail", Name = "直接费明细", Category = "汇总", Description = "直接工程费+措施费汇总" },

        // 折扣与校验
        new() { Key = "DiscountDetail", Name = "折扣明细", Category = "校验", Description = "折扣前后对比" },
        new() { Key = "Warnings", Name = "警告清单", Category = "校验", Description = "计算过程中的全部警告" },
        new() { Key = "QuantityCheck", Name = "工程量清单", Category = "校验", Description = "输入工程量与定额匹配校验" },

        // 扩展报表
        new() { Key = "ProjectInfo", Name = "项目信息", Category = "扩展", Description = "工程基本信息" },
        new() { Key = "FullExport", Name = "完整导出（全部表）", Category = "扩展", Description = "表一至表五全部导出到多工作表" },
    };

    public static ReportDef? GetByKey(string key) => AllReports.FirstOrDefault(r => r.Key == key);
    public static List<ReportDef> ByCategory(string category) => AllReports.Where(r => r.Category == category).ToList();
}
