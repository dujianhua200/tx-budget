using ClosedXML.Excel;
using TxBudget.Batch.Models;
using TxBudget.Core.Engine;
using TxBudget.Core.Infrastructure;

namespace TxBudget.Batch;

/// <summary>
/// 批量结果导出器：将多个项目的计算结果汇总导出到 Excel。
/// </summary>
public class BatchExporter
{
    private static readonly string[] AllowedOutputExts = { ".xlsx", ".xls" };

    /// <summary>
    /// 导出批量生成结果为汇总 Excel（每个项目一个工作表 + 汇总表）。
    /// </summary>
    public void ExportToExcel(BatchGenerateResult result, string outputPath)
    {
        SafeFilePath.ValidateForWrite(outputPath, allowedExtensions: AllowedOutputExts);
        SafeFilePath.EnsureDirectory(outputPath);
        using var workbook = new XLWorkbook();

        // 汇总表
        var summarySheet = workbook.Worksheets.Add("汇总");
        summarySheet.Cell(1, 1).Value = "项目名称";
        summarySheet.Cell(1, 2).Value = "建筑安装工程费（除税价）";
        summarySheet.Cell(1, 3).Value = "销项税额";
        summarySheet.Cell(1, 4).Value = "建筑安装工程费（含税价）";
        summarySheet.Cell(1, 5).Value = "状态";
        summarySheet.Cell(1, 6).Value = "警告数";

        int summaryRow = 2;
        foreach (var proj in result.Projects)
        {
            summarySheet.Cell(summaryRow, 1).Value = proj.ProjectName ?? "";
            summarySheet.Cell(summaryRow, 2).Value = proj.CalcResult?.Table1.GrandExcl ?? 0m;
            summarySheet.Cell(summaryRow, 3).Value = proj.CalcResult?.Table1.GrandVat ?? 0m;
            summarySheet.Cell(summaryRow, 4).Value = proj.CalcResult?.Table1.GrandIncl ?? 0m;
            summarySheet.Cell(summaryRow, 5).Value = proj.Success ? "成功" : $"失败: {proj.ErrorMessage}";
            summarySheet.Cell(summaryRow, 6).Value = proj.Warnings.Count;
            summaryRow++;
        }
        summarySheet.RangeUsed()?.CreateTable("汇总表");

        // 每个项目一张明细表
        foreach (var proj in result.Projects)
        {
            if (proj.CalcResult == null) continue;
            var sheetName = SanitizeSheetName(proj.ProjectName ?? "项目");
            // 避免重名
            string uniqueName = sheetName;
            int suffix = 1;
            while (workbook.Worksheets.Any(ws => ws.Name == uniqueName))
            {
                uniqueName = $"{sheetName}_{suffix++}";
            }
            var sheet = workbook.Worksheets.Add(uniqueName);
            WriteProjectSheet(sheet, proj);
        }

        workbook.SaveAs(outputPath);
    }

    private static void WriteProjectSheet(IXLWorksheet sheet, BatchProjectResult proj)
    {
        var r = proj.CalcResult!;
        int row = 1;

        // 项目信息
        sheet.Cell(row++, 1).Value = $"项目名称: {proj.ProjectName}";
        sheet.Cell(row++, 1).Value = $"工程类型: {r.Info?.工程类型}";
        sheet.Cell(row++, 1).Value = $"折扣: {r.Info?.施工折扣}";
        row++;

        // 表二（折后）
        sheet.Cell(row++, 1).Value = "=== 表二 建筑安装工程费 ===";
        sheet.Cell(row, 1).Value = "费用项";
        sheet.Cell(row, 2).Value = "金额";
        row++;
        foreach (var kv in r.Table2)
        {
            sheet.Cell(row, 1).Value = kv.Key;
            sheet.Cell(row, 2).Value = kv.Value;
            row++;
        }
        row++;

        // 表三A 定额工日
        if (r.Table3A?.Count > 0)
        {
            sheet.Cell(row++, 1).Value = "=== 表三A 定额工日 ===";
            sheet.Cell(row, 1).Value = "定额编号";
            sheet.Cell(row, 2).Value = "名称";
            sheet.Cell(row, 3).Value = "单位";
            sheet.Cell(row, 4).Value = "数量";
            sheet.Cell(row, 5).Value = "技工工日";
            sheet.Cell(row, 6).Value = "普工工日";
            row++;
            foreach (var item in r.Table3A)
            {
                sheet.Cell(row, 1).Value = item.Code;
                sheet.Cell(row, 2).Value = item.Name;
                sheet.Cell(row, 3).Value = item.Unit;
                sheet.Cell(row, 4).Value = item.Qty;
                sheet.Cell(row, 5).Value = item.Tech;
                sheet.Cell(row, 6).Value = item.Labor;
                row++;
            }
            row++;
        }

        // 表四A 甲供材料
        WriteMaterialSection(sheet, ref row, "=== 表四A 甲供材料 ===", r.Table4A);
        // 表四B 乙供材料
        WriteMaterialSection(sheet, ref row, "=== 表四B 乙供材料 ===", r.Table4B);
        // 表四设备
        WriteMaterialSection(sheet, ref row, "=== 表四 设备材料 ===", r.Table4Equip);

        // 表一
        sheet.Cell(row++, 1).Value = "=== 表一 汇总 ===";
        sheet.Cell(row, 1).Value = "项目";
        sheet.Cell(row, 2).Value = "除税价";
        sheet.Cell(row, 3).Value = "增值税";
        sheet.Cell(row, 4).Value = "含税价";
        row++;
        sheet.Cell(row, 1).Value = "建安工程费";
        sheet.Cell(row, 2).Value = r.Table1.SumExcl;
        sheet.Cell(row, 3).Value = r.Table1.SumVat;
        sheet.Cell(row, 4).Value = r.Table1.SumIncl;
        row++;
        sheet.Cell(row, 1).Value = "其他费";
        sheet.Cell(row, 2).Value = r.Table1.OtherFee;
        sheet.Cell(row, 3).Value = r.Table1.OtherVat;
        sheet.Cell(row, 4).Value = r.Table1.OtherIncl;
        row++;
        sheet.Cell(row, 1).Value = "总计";
        sheet.Cell(row, 2).Value = r.Table1.GrandExcl;
        sheet.Cell(row, 3).Value = r.Table1.GrandVat;
        sheet.Cell(row, 4).Value = r.Table1.GrandIncl;
    }

    private static void WriteMaterialSection(IXLWorksheet sheet, ref int row, string title, TableMatResult? matResult)
    {
        if (matResult?.Rows?.Count > 0)
        {
            sheet.Cell(row++, 1).Value = title;
            sheet.Cell(row, 1).Value = "名称";
            sheet.Cell(row, 2).Value = "规格";
            sheet.Cell(row, 3).Value = "单位";
            sheet.Cell(row, 4).Value = "数量";
            sheet.Cell(row, 5).Value = "除税单价";
            sheet.Cell(row, 6).Value = "除税金额";
            row++;
            foreach (var item in matResult.Rows)
            {
                sheet.Cell(row, 1).Value = item.Name;
                sheet.Cell(row, 2).Value = item.Spec;
                sheet.Cell(row, 3).Value = item.Unit;
                sheet.Cell(row, 4).Value = item.Qty;
                sheet.Cell(row, 5).Value = item.PriceExcl;
                sheet.Cell(row, 6).Value = item.AmtExcl;
                row++;
            }
            row++;
        }
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
