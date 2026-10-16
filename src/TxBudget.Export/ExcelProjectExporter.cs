using ClosedXML.Excel;
using TxBudget.Core.Engine;

namespace TxBudget.Export;

/// <summary>
/// 项目计算结果 Excel 导出器：支持单报表/多报表导出。
/// </summary>
public class ExcelProjectExporter
{
    /// <summary>
    /// 导出指定报表到 Excel 文件。
    /// </summary>
    public void Export(string outputPath, CalcResult result, IEnumerable<string> reportKeys)
    {
        using var workbook = new XLWorkbook();
        foreach (var key in reportKeys)
        {
            var def = ReportDefinitions.GetByKey(key);
            if (def == null) continue;
            var sheetName = SanitizeSheetName(def.Name);
            string uniqueName = sheetName;
            int suffix = 1;
            while (workbook.Worksheets.Any(ws => ws.Name == uniqueName))
            {
                uniqueName = $"{sheetName}_{suffix++}";
            }
            var sheet = workbook.Worksheets.Add(uniqueName);
            WriteReport(sheet, result, key);
        }
        workbook.SaveAs(outputPath);
    }

    /// <summary>
    /// 导出全部报表（完整导出）。
    /// </summary>
    public void ExportAll(string outputPath, CalcResult result)
    {
        Export(outputPath, result, ReportDefinitions.AllReports.Select(r => r.Key));
    }

    private static void WriteReport(IXLWorksheet sheet, CalcResult r, string key)
    {
        switch (key)
        {
            case "Table1": WriteTable1(sheet, r); break;
            case "Table2": WriteTable2(sheet, r.Table2); break;
            case "Table2Before": WriteTable2(sheet, r.Table2Before); break;
            case "Table3A": WriteTable3A(sheet, r); break;
            case "Table3B": WriteTable3B(sheet, r.Table3B); break;
            case "Table3C": WriteTable3C(sheet, r.Table3C); break;
            case "Table4A": WriteTable4(sheet, r.Table4A, "甲供材料"); break;
            case "Table4B": WriteTable4(sheet, r.Table4B, "乙供材料"); break;
            case "Table4Equip": WriteTable4(sheet, r.Table4Equip, "设备材料"); break;
            case "Table5": WriteTable5(sheet, r); break;
            case "Summary": WriteSummary(sheet, r); break;
            case "RateDetail": WriteRateDetail(sheet, r); break;
            case "LaborDetail": WriteLaborDetail(sheet, r); break;
            case "MaterialDetail": WriteMaterialDetail(sheet, r); break;
            case "MeasureDetail": WriteMeasureDetail(sheet, r); break;
            case "IndirectDetail": WriteIndirectDetail(sheet, r); break;
            case "DirectDetail": WriteDirectDetail(sheet, r); break;
            case "DiscountDetail": WriteDiscountDetail(sheet, r); break;
            case "Warnings": WriteWarnings(sheet, r); break;
            case "QuantityCheck": WriteQuantityCheck(sheet, r); break;
            case "ProjectInfo": WriteProjectInfo(sheet, r); break;
            case "FullExport": WriteFullExport(sheet, r); break;
            default:
                sheet.Cell(1, 1).Value = $"未知报表类型: {key}";
                break;
        }
    }

    // === 各报表实现 ===

    private static void WriteTable1(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "表一 建设项目总费用";
        int row = 3;
        void Line(string label, decimal excl, decimal vat, decimal incl)
        {
            s.Cell(row, 1).Value = label;
            s.Cell(row, 2).Value = excl;
            s.Cell(row, 3).Value = vat;
            s.Cell(row, 4).Value = incl;
            row++;
        }
        Line("建安工程费", r.Table1.SumExcl, r.Table1.SumVat, r.Table1.SumIncl);
        Line("设备费", r.Table1.EquipFee, r.Table1.EquipVat, r.Table1.EquipIncl);
        Line("其他费", r.Table1.OtherFee, r.Table1.OtherVat, r.Table1.OtherIncl);
        s.Cell(row, 1).Value = "总计";
        s.Cell(row, 2).Value = r.Table1.GrandExcl;
        s.Cell(row, 3).Value = r.Table1.GrandVat;
        s.Cell(row, 4).Value = r.Table1.GrandIncl;
    }

    private static void WriteTable2(IXLWorksheet s, Dictionary<string, decimal> table2)
    {
        s.Cell(1, 1).Value = "表二 建筑安装工程费";
        s.Cell(3, 1).Value = "费用项";
        s.Cell(3, 2).Value = "金额";
        int row = 4;
        foreach (var kv in table2)
        {
            s.Cell(row, 1).Value = kv.Key;
            s.Cell(row, 2).Value = kv.Value;
            row++;
        }
    }

    private static void WriteTable3A(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "表三A 定额工日";
        s.Cell(3, 1).Value = "定额编号"; s.Cell(3, 2).Value = "名称"; s.Cell(3, 3).Value = "单位";
        s.Cell(3, 4).Value = "数量"; s.Cell(3, 5).Value = "技工"; s.Cell(3, 6).Value = "普工";
        int row = 4;
        if (r.Table3A != null)
        {
            foreach (var item in r.Table3A)
            {
                s.Cell(row, 1).Value = item.Code;
                s.Cell(row, 2).Value = item.Name;
                s.Cell(row, 3).Value = item.Unit;
                s.Cell(row, 4).Value = item.Qty;
                s.Cell(row, 5).Value = item.Tech;
                s.Cell(row, 6).Value = item.Labor;
                row++;
            }
        }
        s.Cell(row, 1).Value = "合计";
        s.Cell(row, 5).Value = r.Table3A?.Sum(x => x.Tech) ?? 0m;
        s.Cell(row, 6).Value = r.Table3A?.Sum(x => x.Labor) ?? 0m;
    }

    private static void WriteTable3B(IXLWorksheet s, TableEquipResult? t)
    {
        s.Cell(1, 1).Value = "表三B 机械使用费";
        WriteEquipTable(s, t);
    }

    private static void WriteTable3C(IXLWorksheet s, TableEquipResult? t)
    {
        s.Cell(1, 1).Value = "表三C 仪器仪表费";
        WriteEquipTable(s, t);
    }

    private static void WriteEquipTable(IXLWorksheet s, TableEquipResult? t)
    {
        s.Cell(3, 1).Value = "定额编号"; s.Cell(3, 2).Value = "机械名称"; s.Cell(3, 3).Value = "单位";
        s.Cell(3, 4).Value = "消耗量"; s.Cell(3, 5).Value = "单价"; s.Cell(3, 6).Value = "台班量"; s.Cell(3, 7).Value = "金额";
        int row = 4;
        if (t?.Rows != null)
        {
            foreach (var item in t.Rows)
            {
                s.Cell(row, 1).Value = item.Quota;
                s.Cell(row, 2).Value = item.EquipName;
                s.Cell(row, 3).Value = item.Unit;
                s.Cell(row, 4).Value = item.Consumption;
                s.Cell(row, 5).Value = item.Price;
                s.Cell(row, 6).Value = item.Sessions;
                s.Cell(row, 7).Value = item.Amount;
                row++;
            }
        }
        s.Cell(row, 1).Value = "合计";
        s.Cell(row, 7).Value = t?.Rows?.Sum(x => x.Amount) ?? 0m;
    }

    private static void WriteTable4(IXLWorksheet s, TableMatResult? t, string title)
    {
        s.Cell(1, 1).Value = $"表四 {title}";
        s.Cell(3, 1).Value = "名称"; s.Cell(3, 2).Value = "规格"; s.Cell(3, 3).Value = "单位";
        s.Cell(3, 4).Value = "数量"; s.Cell(3, 5).Value = "除税单价"; s.Cell(3, 6).Value = "除税金额";
        int row = 4;
        if (t?.Rows != null)
        {
            foreach (var item in t.Rows)
            {
                s.Cell(row, 1).Value = item.Name;
                s.Cell(row, 2).Value = item.Spec;
                s.Cell(row, 3).Value = item.Unit;
                s.Cell(row, 4).Value = item.Qty;
                s.Cell(row, 5).Value = item.PriceExcl;
                s.Cell(row, 6).Value = item.AmtExcl;
                row++;
            }
        }
        s.Cell(row, 1).Value = "合计";
        s.Cell(row, 6).Value = t?.Rows?.Sum(x => x.AmtExcl) ?? 0m;
    }

    private static void WriteTable5(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "表五 其他费用";
        s.Cell(3, 1).Value = "费用项"; s.Cell(3, 2).Value = "计算基数"; s.Cell(3, 3).Value = "费率";
        s.Cell(3, 4).Value = "除税金额"; s.Cell(3, 5).Value = "增值税"; s.Cell(3, 6).Value = "含税金额";
        int row = 4;
        if (r.Table5?.Rows != null)
        {
            foreach (var item in r.Table5.Rows)
            {
                s.Cell(row, 1).Value = item.Name;
                s.Cell(row, 2).Value = item.Basis;
                s.Cell(row, 3).Value = item.Rate;
                s.Cell(row, 4).Value = item.Excl;
                s.Cell(row, 5).Value = item.Vat;
                s.Cell(row, 6).Value = item.Incl;
                row++;
            }
        }
    }

    private static void WriteSummary(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "费用汇总";
        int row = 3;
        void Line(string label, decimal excl, decimal vat, decimal incl)
        {
            s.Cell(row, 1).Value = label;
            s.Cell(row, 2).Value = excl;
            s.Cell(row, 3).Value = vat;
            s.Cell(row, 4).Value = incl;
            row++;
        }
        Line("建安工程费", r.Summary.ConstructionExcl, r.Summary.ConstructionVat, r.Summary.ConstructionIncl);
        Line("其他费", r.Summary.Other, r.Summary.OtherVat, r.Summary.OtherIncl);
        s.Cell(row, 1).Value = "总计";
        s.Cell(row, 2).Value = r.Summary.TotalExcl;
        s.Cell(row, 3).Value = r.Summary.TotalVat;
        s.Cell(row, 4).Value = r.Summary.TotalIncl;
    }

    private static void WriteRateDetail(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "费率明细";
        s.Cell(3, 1).Value = "费率项"; s.Cell(3, 2).Value = "取值";
        int row = 4;
        if (r.Rate != null)
        {
            foreach (var kv in r.Rate.OrderBy(x => x.Key))
            {
                s.Cell(row, 1).Value = kv.Key;
                s.Cell(row, 2).Value = kv.Value;
                row++;
            }
        }
    }

    private static void WriteLaborDetail(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "人工费明细";
        s.Cell(3, 1).Value = "项目"; s.Cell(3, 2).Value = "金额";
        int row = 4;
        s.Cell(row, 1).Value = "技工费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("techFee"); row++;
        s.Cell(row, 1).Value = "普工费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("laborFee"); row++;
        s.Cell(row, 1).Value = "人工费合计"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("laborTotal"); row++;
        s.Cell(row, 1).Value = "技工总工日"; s.Cell(row, 2).Value = r.TechDays; row++;
        s.Cell(row, 1).Value = "普工总工日"; s.Cell(row, 2).Value = r.LaborDays; row++;
    }

    private static void WriteMaterialDetail(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "材料费明细";
        s.Cell(3, 1).Value = "项目"; s.Cell(3, 2).Value = "金额";
        int row = 4;
        s.Cell(row, 1).Value = "甲供材料"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("jiaMat"); row++;
        s.Cell(row, 1).Value = "乙供材料"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("yiMat"); row++;
        s.Cell(row, 1).Value = "主要材料费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("mainMat"); row++;
        s.Cell(row, 1).Value = "辅助材料费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("auxMat"); row++;
        s.Cell(row, 1).Value = "材料费合计"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("matTotal"); row++;
    }

    private static void WriteMeasureDetail(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "措施费明细";
        s.Cell(3, 1).Value = "费用项"; s.Cell(3, 2).Value = "金额";
        int row = 4;
        foreach (var key in DiscountEngine.MeasureLeaves)
        {
            s.Cell(row, 1).Value = key;
            s.Cell(row, 2).Value = r.Table2.GetValueOrDefault(key);
            row++;
        }
        s.Cell(row, 1).Value = "措施费合计";
        s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("measureFee");
    }

    private static void WriteIndirectDetail(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "间接费明细";
        s.Cell(3, 1).Value = "费用项"; s.Cell(3, 2).Value = "金额";
        int row = 4;
        s.Cell(row, 1).Value = "规费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("regFee"); row++;
        s.Cell(row, 1).Value = "工程排污费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("sewageFee"); row++;
        s.Cell(row, 1).Value = "社会保障费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("socialFee"); row++;
        s.Cell(row, 1).Value = "住房公积金"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("housingFee"); row++;
        s.Cell(row, 1).Value = "危险作业意外伤害保险费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("accidentFee"); row++;
        s.Cell(row, 1).Value = "企业管理费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("mgmtFee"); row++;
        s.Cell(row, 1).Value = "间接费合计"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("indirectTotal"); row++;
        s.Cell(row, 1).Value = "利润"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("profit"); row++;
    }

    private static void WriteDirectDetail(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "直接费明细";
        s.Cell(3, 1).Value = "费用项"; s.Cell(3, 2).Value = "金额";
        int row = 4;
        s.Cell(row, 1).Value = "人工费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("laborTotal"); row++;
        s.Cell(row, 1).Value = "材料费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("matTotal"); row++;
        s.Cell(row, 1).Value = "机械使用费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("machineFee"); row++;
        s.Cell(row, 1).Value = "仪器仪表费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("instrumentFee"); row++;
        s.Cell(row, 1).Value = "直接工程费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("directFee"); row++;
        s.Cell(row, 1).Value = "措施费"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("measureFee"); row++;
        s.Cell(row, 1).Value = "直接费合计"; s.Cell(row, 2).Value = r.Table2.GetValueOrDefault("directTotal"); row++;
    }

    private static void WriteDiscountDetail(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "折扣前后对比";
        s.Cell(3, 1).Value = "费用项"; s.Cell(3, 2).Value = "折扣前"; s.Cell(3, 3).Value = "折扣后"; s.Cell(3, 4).Value = "差额";
        int row = 4;
        var allKeys = r.Table2Before.Keys.Union(r.Table2After?.Keys ?? Enumerable.Empty<string>()).Distinct().OrderBy(x => x);
        foreach (var key in allKeys)
        {
            var before = r.Table2Before.GetValueOrDefault(key);
            var after = r.Table2After?.GetValueOrDefault(key) ?? 0m;
            s.Cell(row, 1).Value = key;
            s.Cell(row, 2).Value = before;
            s.Cell(row, 3).Value = after;
            s.Cell(row, 4).Value = after - before;
            row++;
        }
    }

    private static void WriteWarnings(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "警告清单";
        s.Cell(3, 1).Value = "代码"; s.Cell(3, 2).Value = "消息"; s.Cell(3, 3).Value = "涉及行";
        int row = 4;
        if (r.Warnings != null)
        {
            foreach (var w in r.Warnings)
            {
                s.Cell(row, 1).Value = w.Code;
                s.Cell(row, 2).Value = w.Message;
                s.Cell(row, 3).Value = w.RowIds != null ? string.Join(",", w.RowIds) : "";
                row++;
            }
        }
    }

    private static void WriteQuantityCheck(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "工程量清单";
        s.Cell(3, 1).Value = "说明：工程量清单需从原始 Project.Quantities 获取，CalcResult 不保留输入明细。";
    }

    private static void WriteProjectInfo(IXLWorksheet s, CalcResult r)
    {
        s.Cell(1, 1).Value = "项目信息";
        int row = 3;
        void Prop(string name, object? val) { s.Cell(row, 1).Value = name; s.Cell(row, 2).Value = val?.ToString() ?? ""; row++; }
        Prop("建设单位", r.Info?.建设单位);
        Prop("建设项目名称", r.Info?.建设项目名称);
        Prop("单项工程名称", r.Info?.单项工程名称);
        Prop("工程类型", r.Info?.工程类型);
        Prop("区县", r.Info?.区县);
        Prop("施工折扣", r.Info?.施工折扣);
        Prop("施工距离", r.Info?.施工距离);
        Prop("冬雨季施工费", r.Info?.冬雨季施工费);
        Prop("编制日期", r.Info?.编制日期);
    }

    private static void WriteFullExport(IXLWorksheet s, CalcResult r)
    {
        // 完整导出仅在单 sheet 模式下写关键数据；通常 FullExport 会展开为多 sheet
        s.Cell(1, 1).Value = "完整导出指示：请使用 ExportAll 方法导出为多工作表。";
        WriteTable1(s, r);
    }

    private static string SanitizeSheetName(string name)
    {
        var invalid = new[] { ':', '\\', '/', '?', '*', '[', ']' };
        var sb = new System.Text.StringBuilder();
        foreach (var c in name)
        {
            sb.Append(invalid.Contains(c) ? '_' : c);
        }
        var result = sb.ToString();
        if (result.Length > 31) result = result.Substring(0, 31);
        if (string.IsNullOrEmpty(result)) result = "Sheet";
        return result;
    }
}
