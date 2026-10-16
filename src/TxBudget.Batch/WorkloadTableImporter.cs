using ClosedXML.Excel;
using TxBudget.Batch.Models;
using TxBudget.Core.Infrastructure;

namespace TxBudget.Batch;

/// <summary>
/// 工作量表导入器：支持 Excel（.xlsx/.xls）和 CSV 格式。
/// 约定列头（不区分大小写，支持中文别名）：
///   QuotaCode / 定额编号 / 编号
///   QuotaName / 定额名称 / 名称
///   Variant / 变体 / 规格
///   Unit / 单位
///   Quantity / 工程量 / 数量
///   Coefficient / 系数
///   Note / 备注
/// </summary>
public class WorkloadTableImporter
{
    private static readonly string[] AllowedImportExts = { ".xlsx", ".xls", ".csv" };

    public static readonly string[] QuotaCodeHeaders = { "quotacode", "定额编号", "编号" };
    public static readonly string[] QuotaNameHeaders = { "quotaname", "定额名称", "名称" };
    public static readonly string[] VariantHeaders = { "variant", "变体", "规格" };
    public static readonly string[] UnitHeaders = { "unit", "单位" };
    public static readonly string[] QuantityHeaders = { "quantity", "工程量", "数量" };
    public static readonly string[] CoefficientHeaders = { "coefficient", "系数" };
    public static readonly string[] NoteHeaders = { "note", "备注" };

    /// <summary>
    /// 从 Excel 文件导入所有工作表为工作量表列表。
    /// 每个工作表成为一张 WorkloadTable；表名作为 SheetName。
    /// </summary>
    public List<WorkloadTable> ImportFromExcel(string filePath)
    {
        SafeFilePath.ValidateForRead(filePath, allowedExtensions: AllowedImportExts);
        using var workbook = new XLWorkbook(filePath);
        var tables = new List<WorkloadTable>();
        foreach (var worksheet in workbook.Worksheets)
        {
            var table = ImportSheet(worksheet);
            if (table.Rows.Count > 0)
            {
                tables.Add(table);
            }
        }
        return tables;
    }

    /// <summary>
    /// 从单个工作表导入。
    /// </summary>
    public WorkloadTable ImportSheet(IXLWorksheet worksheet)
    {
        var table = new WorkloadTable { SheetName = worksheet.Name };

        // 查找表头行（前 10 行内包含 "定额编号" 或 "QuotaCode" 的行）
        int headerRow = 1;
        var headerMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        bool found = false;
        int lastRowNum = worksheet.LastRowUsed()?.RowNumber() ?? 1;
        for (int r = 1; r <= Math.Min(10, lastRowNum); r++)
        {
            headerMap.Clear();
            var row = worksheet.Row(r);
            int lastColNum = row.LastCellUsed()?.Address.ColumnNumber ?? 1;
            for (int c = 1; c <= lastColNum; c++)
            {
                var val = row.Cell(c).GetValue<string>()?.Trim() ?? "";
                if (!string.IsNullOrEmpty(val))
                {
                    headerMap[val] = c;
                }
            }
            if (QuotaCodeHeaders.Any(h => headerMap.ContainsKey(h)))
            {
                headerRow = r;
                found = true;
                break;
            }
        }

        if (!found) return table; // 无有效表头，返回空表

        int quotaCodeCol = FindCol(headerMap, QuotaCodeHeaders);
        int quotaNameCol = FindCol(headerMap, QuotaNameHeaders);
        int variantCol = FindCol(headerMap, VariantHeaders);
        int unitCol = FindCol(headerMap, UnitHeaders);
        int quantityCol = FindCol(headerMap, QuantityHeaders);
        int coefCol = FindCol(headerMap, CoefficientHeaders);
        int noteCol = FindCol(headerMap, NoteHeaders);

        if (quotaCodeCol <= 0) return table;

        for (int r = headerRow + 1; r <= (worksheet.LastRowUsed()?.RowNumber() ?? headerRow); r++)
        {
            var row = worksheet.Row(r);
            var code = row.Cell(quotaCodeCol).GetValue<string>()?.Trim() ?? "";
            if (string.IsNullOrEmpty(code)) continue;

            var wlRow = new WorkloadRow
            {
                Id = $"{worksheet.Name}_R{r}",
                QuotaCode = code,
                QuotaName = quotaNameCol > 0 ? row.Cell(quotaNameCol).GetValue<string>()?.Trim() : null,
                Variant = variantCol > 0 ? row.Cell(variantCol).GetValue<string>()?.Trim() : null,
                Unit = unitCol > 0 ? row.Cell(unitCol).GetValue<string>()?.Trim() : null,
                Quantity = quantityCol > 0 ? ParseDecimal(row.Cell(quantityCol)) : null,
                Coefficient = coefCol > 0 ? ParseCoef(row.Cell(coefCol)) : null,
                Note = noteCol > 0 ? row.Cell(noteCol).GetValue<string>()?.Trim() : null,
            };
            table.Rows.Add(wlRow);
        }

        return table;
    }

    /// <summary>
    /// 从 CSV 文件导入（单表）。
    /// </summary>
    public WorkloadTable ImportFromCsv(string filePath)
    {
        SafeFilePath.ValidateForRead(filePath, allowedExtensions: AllowedImportExts);
        var table = new WorkloadTable { SheetName = Path.GetFileNameWithoutExtension(filePath) };
        var lines = File.ReadAllLines(filePath);
        if (lines.Length < 2) return table;

        var headers = lines[0].Split(',').Select((h, i) => (h: h.Trim().Trim('"'), i)).ToList();
        var headerMap = headers.ToDictionary(x => x.h, x => x.i + 1, StringComparer.OrdinalIgnoreCase);

        int quotaCodeCol = FindCol(headerMap, QuotaCodeHeaders);
        if (quotaCodeCol <= 0) return table;

        int quotaNameCol = FindCol(headerMap, QuotaNameHeaders);
        int variantCol = FindCol(headerMap, VariantHeaders);
        int unitCol = FindCol(headerMap, UnitHeaders);
        int quantityCol = FindCol(headerMap, QuantityHeaders);
        int coefCol = FindCol(headerMap, CoefficientHeaders);
        int noteCol = FindCol(headerMap, NoteHeaders);

        for (int r = 1; r < lines.Length; r++)
        {
            var cols = ParseCsvLine(lines[r]);
            if (cols.Count < quotaCodeCol) continue;
            var code = cols[quotaCodeCol - 1]?.Trim() ?? "";
            if (string.IsNullOrEmpty(code)) continue;

            var wlRow = new WorkloadRow
            {
                Id = $"CSV_R{r}",
                QuotaCode = code,
                QuotaName = quotaNameCol > 0 && cols.Count >= quotaNameCol ? cols[quotaNameCol - 1]?.Trim() : null,
                Variant = variantCol > 0 && cols.Count >= variantCol ? cols[variantCol - 1]?.Trim() : null,
                Unit = unitCol > 0 && cols.Count >= unitCol ? cols[unitCol - 1]?.Trim() : null,
                Quantity = quantityCol > 0 && cols.Count >= quantityCol ? ParseDecimal(cols[quantityCol - 1]) : null,
                Coefficient = coefCol > 0 && cols.Count >= coefCol ? ParseCoef(cols[coefCol - 1]) : null,
                Note = noteCol > 0 && cols.Count >= noteCol ? cols[noteCol - 1]?.Trim() : null,
            };
            table.Rows.Add(wlRow);
        }

        return table;
    }

    private static int FindCol(Dictionary<string, int> headerMap, string[] candidates)
    {
        foreach (var c in candidates)
        {
            if (headerMap.TryGetValue(c, out var col)) return col;
        }
        return -1;
    }

    private static decimal? ParseDecimal(IXLCell cell)
    {
        if (cell.IsEmpty()) return null;
        if (cell.DataType == XLDataType.Number) return (decimal?)cell.GetDouble();
        if (decimal.TryParse(cell.GetValue<string>(), out var d)) return d;
        return null;
    }

    private static decimal? ParseDecimal(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        if (decimal.TryParse(text, out var d)) return d;
        return null;
    }

    private static object? ParseCoef(IXLCell cell)
    {
        if (cell.IsEmpty()) return null;
        if (cell.DataType == XLDataType.Number) return (decimal?)cell.GetDouble();
        if (cell.DataType == XLDataType.Boolean) return cell.GetBoolean();
        var s = cell.GetValue<string>()?.Trim() ?? "";
        if (decimal.TryParse(s, out var d)) return d;
        return s; // 保留字符串表达式（如 "0.5" 或 "工日X0.5"）
    }

    private static object? ParseCoef(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        if (decimal.TryParse(text, out var d)) return d;
        if (bool.TryParse(text, out var b)) return b;
        return text;
    }

    /// <summary>
    /// 简单 CSV 行解析（支持引号包裹）。
    /// </summary>
    private static List<string?> ParseCsvLine(string line)
    {
        var result = new List<string?>();
        var sb = new System.Text.StringBuilder();
        bool inQuotes = false;
        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    sb.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
            }
            else if (c == ',' && !inQuotes)
            {
                result.Add(sb.ToString());
                sb.Clear();
            }
            else
            {
                sb.Append(c);
            }
        }
        result.Add(sb.ToString());
        return result;
    }
}
