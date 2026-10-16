using ClosedXML.Excel;
using TxBudget.Core.Engine;
using TxBudget.Core.Model;

namespace TxBudget.Library;

/// <summary>
/// 标准库 Excel 导出器：将 8 类库数据导出到多工作表 Excel。
/// </summary>
public class ExcelLibraryExporter
{
    public void Export(string outputPath, LibraryManager manager)
    {
        using var workbook = new XLWorkbook();

        ExportQuotas(workbook, manager.Quotas);
        ExportMaterials(workbook, manager.Materials);
        ExportRules(workbook, manager.Rules);
        ExportMachinePrices(workbook, manager.MachinePrices, "机械价格");
        ExportMachinePrices(workbook, manager.InstrumentPrices, "仪表价格");
        ExportQuotaMachines(workbook, manager.QuotaMachines, "定额机械");
        ExportQuotaMachines(workbook, manager.QuotaInstruments, "定额仪表");
        ExportRates(workbook, manager.Rates);

        workbook.SaveAs(outputPath);
    }

    private static void ExportQuotas(XLWorkbook wb, IReadOnlyList<Quota> items)
    {
        var ws = wb.Worksheets.Add("定额");
        ws.Cell(1, 1).Value = "定额编号";
        ws.Cell(1, 2).Value = "名称";
        ws.Cell(1, 3).Value = "单位";
        ws.Cell(1, 4).Value = "技工";
        ws.Cell(1, 5).Value = "普工";
        ws.Cell(1, 6).Value = "系数";
        ws.Cell(1, 7).Value = "册";
        ws.Cell(1, 8).Value = "别名";
        int row = 2;
        foreach (var item in items)
        {
            ws.Cell(row, 1).Value = item.Code;
            ws.Cell(row, 2).Value = item.Name;
            ws.Cell(row, 3).Value = item.Unit;
            ws.Cell(row, 4).Value = item.Tech;
            ws.Cell(row, 5).Value = item.Labor;
            ws.Cell(row, 6).Value = item.Coef;
            ws.Cell(row, 7).Value = item.Book;
            ws.Cell(row, 8).Value = item.Alias;
            row++;
        }
        ws.RangeUsed()?.CreateTable("定额表");
    }

    private static void ExportMaterials(XLWorkbook wb, IReadOnlyList<Material> items)
    {
        var ws = wb.Worksheets.Add("材料");
        ws.Cell(1, 1).Value = "名称";
        ws.Cell(1, 2).Value = "规格";
        ws.Cell(1, 3).Value = "单位";
        ws.Cell(1, 4).Value = "除税价";
        ws.Cell(1, 5).Value = "供应方式";
        int row = 2;
        foreach (var item in items)
        {
            ws.Cell(row, 1).Value = item.Name;
            ws.Cell(row, 2).Value = item.Spec;
            ws.Cell(row, 3).Value = item.Unit;
            ws.Cell(row, 4).Value = item.PriceExcl;
            ws.Cell(row, 5).Value = item.Supply;
            row++;
        }
        ws.RangeUsed()?.CreateTable("材料表");
    }

    private static void ExportRules(XLWorkbook wb, IReadOnlyList<MaterialRule> items)
    {
        var ws = wb.Worksheets.Add("材料规则");
        ws.Cell(1, 1).Value = "定额编号";
        ws.Cell(1, 2).Value = "材料";
        ws.Cell(1, 3).Value = "规格";
        ws.Cell(1, 4).Value = "类型";
        ws.Cell(1, 5).Value = "变体";
        ws.Cell(1, 6).Value = "消耗量";
        ws.Cell(1, 7).Value = "供应方式";
        int row = 2;
        foreach (var item in items)
        {
            ws.Cell(row, 1).Value = item.Quota;
            ws.Cell(row, 2).Value = item.Material;
            ws.Cell(row, 3).Value = item.Spec;
            ws.Cell(row, 4).Value = item.Kind;
            ws.Cell(row, 5).Value = item.Variant;
            ws.Cell(row, 6).Value = item.Consumption;
            ws.Cell(row, 7).Value = item.Supply;
            row++;
        }
        ws.RangeUsed()?.CreateTable("材料规则表");
    }

    private static void ExportMachinePrices(XLWorkbook wb, IReadOnlyList<MachinePrice> items, string sheetName)
    {
        var ws = wb.Worksheets.Add(sheetName);
        ws.Cell(1, 1).Value = "编号";
        ws.Cell(1, 2).Value = "名称";
        ws.Cell(1, 3).Value = "单价";
        int row = 2;
        foreach (var item in items)
        {
            ws.Cell(row, 1).Value = item.Code;
            ws.Cell(row, 2).Value = item.Name;
            ws.Cell(row, 3).Value = item.Price;
            row++;
        }
        ws.RangeUsed()?.CreateTable($"{sheetName}表");
    }

    private static void ExportQuotaMachines(XLWorkbook wb, IReadOnlyList<QuotaMachine> items, string sheetName)
    {
        var ws = wb.Worksheets.Add(sheetName);
        ws.Cell(1, 1).Value = "定额编号";
        ws.Cell(1, 2).Value = "机械编号";
        ws.Cell(1, 3).Value = "机械名称";
        ws.Cell(1, 4).Value = "单位";
        ws.Cell(1, 5).Value = "数量";
        int row = 2;
        foreach (var item in items)
        {
            ws.Cell(row, 1).Value = item.Quota;
            ws.Cell(row, 2).Value = item.MCode;
            ws.Cell(row, 3).Value = item.MName;
            ws.Cell(row, 4).Value = item.Unit;
            ws.Cell(row, 5).Value = item.Qty;
            row++;
        }
        ws.RangeUsed()?.CreateTable($"{sheetName}表");
    }

    private static void ExportRates(XLWorkbook wb, RatesBlob? rates)
    {
        var ws = wb.Worksheets.Add("费率");
        // 表头
        ws.Cell(1, 1).Value = "工程类型";
        int col = 2;
        foreach (var def in RateResolver.RateFieldDefs)
        {
            ws.Cell(1, col).Value = def.Name;
            col++;
        }
        int row = 2;
        if (rates?.ByProjectType != null)
        {
            foreach (var kv in rates.ByProjectType)
            {
                ws.Cell(row, 1).Value = kv.Key;
                col = 2;
                foreach (var def in RateResolver.RateFieldDefs)
                {
                    ws.Cell(row, col).Value = kv.Value.GetRate(def.Key);
                    col++;
                }
                row++;
            }
        }
        ws.RangeUsed()?.CreateTable("费率表");
    }
}
