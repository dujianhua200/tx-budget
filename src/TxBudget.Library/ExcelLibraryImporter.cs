using ClosedXML.Excel;
using TxBudget.Core.Engine;
using TxBudget.Core.Infrastructure;
using TxBudget.Core.Model;

namespace TxBudget.Library;

/// <summary>
/// 标准库 Excel 导入器：支持 merge（合并，保留现有、追加新项）和 replace（全量替换）两种模式。
/// </summary>
public class ExcelLibraryImporter
{
    public enum ImportMode { Merge, Replace }

    private static readonly string[] AllowedImportExts = { ".xlsx", ".xls" };

    /// <summary>
    /// 从 Excel 文件导入全部库数据。
    /// 约定工作表名称：
    ///   定额 / Quotas
    ///   材料 / Materials
    ///   材料规则 / MaterialRules
    ///   机械价格 / MachinePrices
    ///   仪表价格 / InstrumentPrices
    ///   定额机械 / QuotaMachines
    ///   定额仪表 / QuotaInstruments
    ///   费率 / Rates
    /// </summary>
    public void Import(string filePath, LibraryManager manager, ImportMode mode = ImportMode.Merge)
    {
        SafeFilePath.ValidateForRead(filePath, allowedExtensions: AllowedImportExts);
        using var workbook = new XLWorkbook(filePath);

        if (mode == ImportMode.Replace)
        {
            manager.ClearAll();
        }

        foreach (var ws in workbook.Worksheets)
        {
            var name = ws.Name.Trim();
            switch (name.ToLowerInvariant())
            {
                case "quotas":
                case "定额":
                    ImportQuotas(ws, manager, mode);
                    break;
                case "materials":
                case "材料":
                    ImportMaterials(ws, manager, mode);
                    break;
                case "materialrules":
                case "材料规则":
                    ImportRules(ws, manager, mode);
                    break;
                case "machineprices":
                case "机械价格":
                    ImportMachinePrices(ws, manager, mode);
                    break;
                case "instrumentprices":
                case "仪表价格":
                    ImportInstrumentPrices(ws, manager, mode);
                    break;
                case "quotamachines":
                case "定额机械":
                    ImportQuotaMachines(ws, manager, mode);
                    break;
                case "quotainstruments":
                case "定额仪表":
                    ImportQuotaInstruments(ws, manager, mode);
                    break;
                case "rates":
                case "费率":
                    ImportRates(ws, manager, mode);
                    break;
            }
        }
    }

    private static void ImportQuotas(IXLWorksheet ws, LibraryManager manager, ImportMode mode)
    {
        var hdr = ReadHeader(ws);
        if (hdr.Count == 0) return;
        int cCode = FindCol(hdr, "Code", "定额编号", "编号");
        int cName = FindCol(hdr, "Name", "定额名称", "名称");
        int cUnit = FindCol(hdr, "Unit", "单位");
        int cTech = FindCol(hdr, "Tech", "技工");
        int cLabor = FindCol(hdr, "Labor", "普工");
        int cCoef = FindCol(hdr, "Coef", "系数");
        int cBook = FindCol(hdr, "Book", "册");
        int cAlias = FindCol(hdr, "Alias", "别名");

        if (cCode <= 0) return;

        foreach (var row in ws.RowsUsed().Skip(1))
        {
            var code = GetString(row, cCode);
            if (string.IsNullOrEmpty(code)) continue;

            if (mode == ImportMode.Merge && manager.FindQuota(code) != null) continue;

            manager.AddQuota(new Quota
            {
                Code = code,
                Name = GetString(row, cName) ?? "",
                Unit = GetString(row, cUnit) ?? "",
                Tech = GetDecimal(row, cTech),
                Labor = GetDecimal(row, cLabor),
                Coef = GetDecimal(row, cCoef),
                Book = GetString(row, cBook),
                Alias = GetString(row, cAlias),
            });
        }
    }

    private static void ImportMaterials(IXLWorksheet ws, LibraryManager manager, ImportMode mode)
    {
        var hdr = ReadHeader(ws);
        int cName = FindCol(hdr, "Name", "名称");
        int cSpec = FindCol(hdr, "Spec", "规格");
        int cUnit = FindCol(hdr, "Unit", "单位");
        int cPrice = FindCol(hdr, "PriceExcl", "除税价", "单价");
        int cSupply = FindCol(hdr, "Supply", "供应方式", "供方");

        if (cName <= 0) return;

        foreach (var row in ws.RowsUsed().Skip(1))
        {
            var name = GetString(row, cName);
            var spec = GetString(row, cSpec) ?? "";
            if (string.IsNullOrEmpty(name)) continue;

            if (mode == ImportMode.Merge && manager.FindMaterial(name, spec) != null) continue;

            manager.AddMaterial(new Material
            {
                Name = name,
                Spec = spec,
                Unit = GetString(row, cUnit) ?? "",
                PriceExcl = GetDecimal(row, cPrice),
                Supply = GetString(row, cSupply),
            });
        }
    }

    private static void ImportRules(IXLWorksheet ws, LibraryManager manager, ImportMode mode)
    {
        var hdr = ReadHeader(ws);
        int cQuota = FindCol(hdr, "Quota", "定额编号");
        int cMaterial = FindCol(hdr, "Material", "材料");
        int cSpec = FindCol(hdr, "Spec", "规格");
        int cKind = FindCol(hdr, "Kind", "类型");
        int cVariant = FindCol(hdr, "Variant", "变体");
        int cConsumption = FindCol(hdr, "Consumption", "消耗量");
        int cSupply = FindCol(hdr, "Supply", "供应方式");

        if (cQuota <= 0) return;
        int idx = manager.Rules.Count;

        foreach (var row in ws.RowsUsed().Skip(1))
        {
            var quota = GetString(row, cQuota);
            if (string.IsNullOrEmpty(quota)) continue;

            manager.AddRule(new MaterialRule
            {
                Id = $"import_{idx++}",
                Quota = quota,
                Material = GetString(row, cMaterial) ?? "",
                Spec = GetString(row, cSpec) ?? "",
                Kind = GetString(row, cKind) ?? "",
                Variant = GetString(row, cVariant),
                Consumption = GetDecimal(row, cConsumption),
                Supply = GetString(row, cSupply),
            });
        }
    }

    private static void ImportMachinePrices(IXLWorksheet ws, LibraryManager manager, ImportMode mode)
    {
        var hdr = ReadHeader(ws);
        int cCode = FindCol(hdr, "Code", "编号");
        int cName = FindCol(hdr, "Name", "名称");
        int cPrice = FindCol(hdr, "Price", "单价");

        if (cCode <= 0) return;

        foreach (var row in ws.RowsUsed().Skip(1))
        {
            var code = GetString(row, cCode);
            if (string.IsNullOrEmpty(code)) continue;

            if (mode == ImportMode.Merge && manager.FindMachinePrice(code) != null) continue;

            manager.AddMachinePrice(new MachinePrice
            {
                Code = code,
                Name = GetString(row, cName),
                Price = GetDecimal(row, cPrice) ?? 0m,
            });
        }
    }

    private static void ImportInstrumentPrices(IXLWorksheet ws, LibraryManager manager, ImportMode mode)
    {
        var hdr = ReadHeader(ws);
        int cCode = FindCol(hdr, "Code", "编号");
        int cName = FindCol(hdr, "Name", "名称");
        int cPrice = FindCol(hdr, "Price", "单价");

        if (cCode <= 0) return;

        foreach (var row in ws.RowsUsed().Skip(1))
        {
            var code = GetString(row, cCode);
            if (string.IsNullOrEmpty(code)) continue;

            if (mode == ImportMode.Merge && manager.FindInstrumentPrice(code) != null) continue;

            manager.AddInstrumentPrice(new MachinePrice
            {
                Code = code,
                Name = GetString(row, cName),
                Price = GetDecimal(row, cPrice) ?? 0m,
            });
        }
    }

    private static void ImportQuotaMachines(IXLWorksheet ws, LibraryManager manager, ImportMode mode)
    {
        ImportQuotaMachinesCore(ws, manager, isInstrument: false);
    }

    private static void ImportQuotaInstruments(IXLWorksheet ws, LibraryManager manager, ImportMode mode)
    {
        ImportQuotaMachinesCore(ws, manager, isInstrument: true);
    }

    private static void ImportQuotaMachinesCore(IXLWorksheet ws, LibraryManager manager, bool isInstrument)
    {
        var hdr = ReadHeader(ws);
        int cQuota = FindCol(hdr, "Quota", "定额编号");
        int cMCode = FindCol(hdr, "MCode", "机械编号");
        int cMName = FindCol(hdr, "MName", "机械名称");
        int cUnit = FindCol(hdr, "Unit", "单位");
        int cQty = FindCol(hdr, "Qty", "数量");

        if (cQuota <= 0) return;
        int idx = isInstrument ? manager.QuotaInstruments.Count : manager.QuotaMachines.Count;

        foreach (var row in ws.RowsUsed().Skip(1))
        {
            var quota = GetString(row, cQuota);
            if (string.IsNullOrEmpty(quota)) continue;

            var item = new QuotaMachine
            {
                Id = $"import_{idx++}",
                Quota = quota,
                MCode = GetString(row, cMCode) ?? "",
                MName = GetString(row, cMName),
                Unit = GetString(row, cUnit),
                Qty = GetDecimal(row, cQty),
            };

            if (isInstrument) manager.AddQuotaInstrument(item);
            else manager.AddQuotaMachine(item);
        }
    }

    private static void ImportRates(IXLWorksheet ws, LibraryManager manager, ImportMode mode)
    {
        var hdr = ReadHeader(ws);
        int cProjectType = FindCol(hdr, "ProjectType", "工程类型");
        if (cProjectType <= 0) return;

        // 动态查找各费率列
        var rateCols = new Dictionary<string, int>();
        foreach (var def in RateResolver.RateFieldDefs)
        {
            int col = FindCol(hdr, def.Key, def.Name);
            if (col > 0) rateCols[def.Key] = col;
        }

        foreach (var row in ws.RowsUsed().Skip(1))
        {
            var projectType = GetString(row, cProjectType);
            if (string.IsNullOrEmpty(projectType)) continue;

            var rateRow = new NamedRateRow();
            foreach (var kv in rateCols)
            {
                var val = GetDecimal(row, kv.Value);
                SetNamedRate(rateRow, kv.Key, val);
            }
            manager.SetRateRow(projectType, rateRow);
        }
    }

    private static Dictionary<string, int> ReadHeader(IXLWorksheet ws)
    {
        var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var firstRow = ws.FirstRowUsed();
        if (firstRow == null) return map;
        foreach (var cell in firstRow.CellsUsed())
        {
            var val = cell.GetValue<string>()?.Trim() ?? "";
            if (!string.IsNullOrEmpty(val))
                map[val] = cell.Address.ColumnNumber;
        }
        return map;
    }

    private static int FindCol(Dictionary<string, int> hdr, params string[] candidates)
    {
        foreach (var c in candidates)
            if (hdr.TryGetValue(c, out var col)) return col;
        return -1;
    }

    private static string? GetString(IXLRow row, int col)
    {
        if (col <= 0) return null;
        return row.Cell(col).GetValue<string>()?.Trim();
    }

    private static decimal? GetDecimal(IXLRow row, int col)
    {
        if (col <= 0) return null;
        var cell = row.Cell(col);
        if (cell.IsEmpty()) return null;
        if (cell.DataType == XLDataType.Number) return (decimal?)cell.GetDouble();
        if (decimal.TryParse(cell.GetValue<string>(), out var d)) return d;
        return null;
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
            case "winterRate": row.WinterRate = value; break;
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
