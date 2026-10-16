using System.Collections.Generic;
using TxBudget.Core.Model;

namespace TxBudget.Core.Engine;

/// <summary>
/// 计算结果：表一/表二/表三/表四/表五 + 汇总表 + 警告。
/// 字段命名与 calc.mjs 输出保持一致（驼峰），便于与 JS 参考样本对齐。
/// </summary>
public class CalcResult
{
    public ProjectInfo Info { get; set; } = new();
    public Dictionary<string, decimal> Rate { get; set; } = new();

    // 工日
    public decimal TechSub { get; set; }
    public decimal LaborSub { get; set; }
    public decimal AdjRate { get; set; }
    public decimal TechDays { get; set; }
    public decimal LaborDays { get; set; }

    // 表三
    public List<Table3ARow> Table3A { get; set; } = new();
    public TableEquipResult Table3B { get; set; } = new();
    public TableEquipResult Table3C { get; set; } = new();

    // 表四
    public TableMatResult Table4A { get; set; } = new();   // 甲供
    public TableMatResult Table4B { get; set; } = new();   // 乙供
    public TableMatResult Table4Equip { get; set; } = new(); // 设备

    // 表二
    public Dictionary<string, decimal> Table2Before { get; set; } = new();
    public Dictionary<string, decimal> Table2After { get; set; } = new();
    /// <summary>兼容旧调用方：默认指向 Table2After。</summary>
    public Dictionary<string, decimal> Table2 => Table2After;

    // 表五
    public Table5Result Table5 { get; set; } = new();

    // 表一
    public Table1Result Table1 { get; set; } = new();

    // 汇总表
    public SummaryResult Summary { get; set; } = new();

    // 警告
    public List<CalcWarning> Warnings { get; set; } = new();

    // 折扣信息
    public decimal Discount { get; set; } = 1m;
    public DiscountRuleInfo DiscountRule { get; set; } = new();

    // 勘察
    public decimal SurveyKm { get; set; }
    public decimal SurveyRaw { get; set; }
}

public class CalcWarning
{
    public string Code { get; set; } = "";
    public string Message { get; set; } = "";
    public List<string>? RowIds { get; set; }
}

public class DiscountRuleInfo
{
    public decimal DiscountRate { get; set; } = 1m;
    public List<string> NoDiscountKeys { get; set; } = new();
    public List<string> ZeroAfterDiscountKeys { get; set; } = new();
}

public class Table3ARow
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Unit { get; set; } = "";
    public decimal Qty { get; set; }       // 加权量
    public decimal TechUnit { get; set; }   // 单位技工
    public decimal LaborUnit { get; set; }    // 单位普工
    public decimal Tech { get; set; }
    public decimal Labor { get; set; }
}

public class TableEquipResult
{
    public List<TableEquipRow> Rows { get; set; } = new();
    public decimal Total { get; set; }
}

public class TableEquipRow
{
    public string Quota { get; set; } = "";
    public string QuotaName { get; set; } = "";
    public string Unit { get; set; } = "";
    public decimal Qty { get; set; }
    public string EquipName { get; set; } = "";
    public string EquipUnit { get; set; } = "";
    public decimal Consumption { get; set; }
    public decimal Price { get; set; }
    public decimal Sessions { get; set; }
    public decimal Amount { get; set; }
}

public class TableMatResult
{
    public List<TableMatRow> Rows { get; set; } = new();
    public decimal TotalExcl { get; set; }
    public decimal TotalVat { get; set; }
    public decimal TotalIncl { get; set; }
}

public class TableMatRow
{
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string Spec { get; set; } = "";
    public string Unit { get; set; } = "";
    public decimal Qty { get; set; }
    public decimal AutoQty { get; set; }
    public decimal Delta { get; set; }
    public decimal PriceExcl { get; set; }
    public decimal PriceVat { get; set; }
    public decimal PriceIncl { get; set; }
    public decimal AmtExcl { get; set; }
    public decimal AmtVat { get; set; }
    public decimal AmtIncl { get; set; }
    public bool Unmatched { get; set; }
}

public class Table1Result
{
    public decimal BeforeDiscount { get; set; }
    public decimal AfterDiscount { get; set; }
    public decimal TaxBefore { get; set; }
    public decimal TaxAfter { get; set; }
    public decimal TotalBefore { get; set; }
    public decimal TotalAfter { get; set; }
    public decimal OtherFee { get; set; }
    public decimal OtherVat { get; set; }
    public decimal OtherIncl { get; set; }
    public decimal SumExcl { get; set; }
    public decimal SumVat { get; set; }
    public decimal SumIncl { get; set; }
    public decimal EquipFee { get; set; }
    public decimal EquipVat { get; set; }
    public decimal EquipIncl { get; set; }
    public decimal GrandExcl { get; set; }
    public decimal GrandVat { get; set; }
    public decimal GrandIncl { get; set; }
}

public class SummaryResult
{
    public decimal ConstructionExcl { get; set; }
    public decimal ConstructionVat { get; set; }
    public decimal ConstructionIncl { get; set; }
    public decimal Other { get; set; }
    public decimal OtherVat { get; set; }
    public decimal OtherIncl { get; set; }
    public decimal TotalExcl { get; set; }
    public decimal TotalVat { get; set; }
    public decimal TotalIncl { get; set; }
}

public class Table5Result
{
    public List<Table5Row> Rows { get; set; } = new();
    public decimal TotalExcl { get; set; }
    public decimal TotalVat { get; set; }
    public decimal TotalIncl { get; set; }
    // 扁平字段（兼容旧调用方）。
    public decimal Mgmt2 { get; set; }
    public decimal Mgmt2Vat { get; set; }
    public decimal Mgmt2Incl { get; set; }
    public decimal SurveyKm { get; set; }
    public decimal SurveyFee { get; set; }
    public decimal SurveyVat { get; set; }
    public decimal DesignFee { get; set; }
    public decimal DesignVat { get; set; }
    public decimal DesignTotal { get; set; }
    public decimal DesignTotalVat { get; set; }
    public decimal SafetyFee { get; set; }
    public decimal SafetyVat { get; set; }
    public decimal SafetyIncl { get; set; }
    public decimal ProductionPrepFee { get; set; }
    public decimal ProductionPrepVat { get; set; }
    public decimal ProductionPrepIncl { get; set; }
}

public class Table5Row
{
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string Basis { get; set; } = "";
    public decimal? Rate { get; set; }
    public decimal? VatRate { get; set; }
    public decimal Order { get; set; }
    public string Note { get; set; } = "";
    public bool Enabled { get; set; }
    public decimal Excl { get; set; }
    public decimal Vat { get; set; }
    public decimal Incl { get; set; }
    public decimal Amount { get; set; }
}