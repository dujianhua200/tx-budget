using System.Collections.Generic;
using System.Linq;
using TxBudget.Core.Model;

namespace TxBudget.Core.Engine;

/// <summary>
/// 通信工程概预算计算引擎（移植自 calc.mjs）。
/// 公式链与 v3.0 母版逐一对齐；v2 口径全部保留：
///   - 表二：先算 table2Before，再调 applyDiscount 得 table2After
///   - 安全生产费 = 折前建安工程费除税价 × 2%（财资〔2022〕136号）+ 增值税 0
///   - 汇总表：建安费 = 表一折后建安费 = 表二折后除税价
///   - 具名费率读取
///   - 孤儿工程量行记 warnings
/// </summary>
public static class CalcEngine
{
    /// <summary>
    /// 计算一个工程的全部预算表。
    /// </summary>
    public static CalcResult CalcProject(Project project, LibrarySet libs)
    {
        libs ??= new LibrarySet();
        var info = ProjectInfo.MergeDefaults(project.Info);
        var warnings = new List<CalcWarning>();

        // ---- 0. 费率 + 折扣/增值税率（§2.4 优先级：rateOverrides > info > 配置方案 > 兜底）----
        var rateDict = RateResolver.ResolveNamedRates(libs.Rates, info.工程类型, info.冬雨季施工费);
        if (libs.Rates?.ByProjectType == null || !libs.Rates.ByProjectType.ContainsKey(info.工程类型))
        {
            warnings.Add(new CalcWarning
            {
                Code = "unknownProjectType",
                Message = $"未知工程类型或费率缺失：\"{info.工程类型}\"，费率按 0 计算",
            });
        }
        else
        {
            // 检查具名路径下是否有缺失字段（与 JS 行为对齐：具名路径下缺失字段才告警）
            if (libs.Rates.ByProjectType.TryGetValue(info.工程类型, out var row) && row != null)
            {
                foreach (var def in RateResolver.RateFieldDefs)
                {
                    if (def.Key == "winterRate") continue;
                    var v = row.GetRate(def.Key);
                    if (!v.HasValue)
                    {
                        warnings.Add(new CalcWarning
                        {
                            Code = $"missingRate:{def.Key}",
                            Message = $"费率缺失：{info.工程类型} / {def.Name}，按 0 计算",
                        });
                    }
                }
                // winterTable 缺失检查
                if (!row.WinterRate.HasValue
                    && (libs.Rates.WinterTable == null
                        || !libs.Rates.WinterTable.ContainsKey(info.冬雨季施工费 ?? "")))
                {
                    warnings.Add(new CalcWarning
                    {
                        Code = "missingRate:winterTable",
                        Message = $"冬雨季费率缺失：地区\"{info.冬雨季施工费}\"不在 winterTable 中，按 0 计算",
                    });
                }
            }
        }

        var resolved = ResolveRates(libs, project);
        var discount = resolved.Discount;
        if (discount <= 0m || discount > 1m)
        {
            warnings.Add(new CalcWarning
            {
                Code = "invalidDiscount",
                Message = $"折扣率非法：{resolved.Discount}，按 1 计算",
            });
            discount = 1m;
        }
        var jiaTax = resolved.JiaTax;
        var yiTax = resolved.YiTax;
        var outputTaxRate = resolved.OutputTax;
        var safetyVatFallback = resolved.SafetyVat;
        rateDict["jiaTax"] = jiaTax;
        rateDict["yiTax"] = yiTax;
        rateDict["outputTax"] = outputTaxRate;
        rateDict["taxRate"] = outputTaxRate;

        // ---- 索引构建 ----
        var quotas = libs.Quotas ?? new List<Quota>();
        var materials = libs.Materials ?? new List<Material>();
        var rules = libs.Rules ?? new List<MaterialRule>();
        var quotaByCode = new Dictionary<string, Quota>();
        var duplicateCodes = new HashSet<string>();
        foreach (var q in quotas)
        {
            if (quotaByCode.ContainsKey(q.Code)) duplicateCodes.Add(q.Code);
            else quotaByCode[q.Code] = q;
        }
        var matByKey = new Dictionary<string, Material>();
        foreach (var m in materials)
        {
            matByKey[$"{m.Name}|{m.Spec}"] = m;
        }
        var machinePrice = new Dictionary<string, decimal>();
        foreach (var m in libs.MachinePrices ?? new List<MachinePrice>())
            machinePrice[m.Code] = m.Price;
        var instrumentPrice = new Dictionary<string, decimal>();
        foreach (var m in libs.InstrumentPrices ?? new List<MachinePrice>())
            instrumentPrice[m.Code] = m.Price;
        var ruleEnabled = new Dictionary<string, bool>();
        foreach (var o in project.RuleOverrides ?? new List<RuleOverride>())
            ruleEnabled[o.RuleId] = o.Enabled;

        // ---- 1. 工程量汇总 ----
        var byQuota = new Dictionary<string, (decimal raw, decimal weighted)>();
        var byVariant = new Dictionary<string, decimal>();
        var surveyCodes = new HashSet<string> { "TXL1-001", "TXL1-002", "TXL1-003" };
        decimal surveyRaw = 0m;
        var orphanRowIds = new List<string>();
        var orphanCodes = new HashSet<string>();
        var invalidRowIds = new List<string>();
        var quantities = project.Quantities ?? new List<QuantityRow>();
        for (int qi = 0; qi < quantities.Count; qi++)
        {
            var q = quantities[qi];
            var rowId = q.Id ?? $"qty_{qi}";
            if (string.IsNullOrEmpty(q.Quota) || !quotaByCode.ContainsKey(q.Quota))
            {
                orphanRowIds.Add(rowId);
                if (!string.IsNullOrEmpty(q.Quota)) orphanCodes.Add(q.Quota);
                continue;
            }
            var qty = Num(q.Qty);
            if (q.Qty.HasValue && qty < 0m)
            {
                invalidRowIds.Add(rowId);
                continue;
            }
            if (qty == 0m) continue;
            bool coefIsExplicit = q.Coef != null && !(q.Coef is string s && string.IsNullOrEmpty(s));
            decimal coef = coefIsExplicit ? CoerceDecimal(q.Coef) : 1m;
            if (coefIsExplicit && (q.Coef is decimal qdec) && qdec <= 0m)
            {
                invalidRowIds.Add(rowId);
                continue;
            }
            if (coef <= 0m) continue;
            if (!byQuota.TryGetValue(q.Quota, out var agg))
            {
                agg = (0m, 0m);
            }
            agg.raw += qty;
            agg.weighted += qty * coef;
            byQuota[q.Quota] = agg;
            var vk = $"{q.Quota}|{q.Variant ?? ""}";
            byVariant[vk] = byVariant.TryGetValue(vk, out var bv) ? bv + qty : qty;
            if (surveyCodes.Contains(q.Quota)) surveyRaw += qty;
        }
        var surveyKm = surveyRaw / 10m;
        if (orphanRowIds.Count > 0)
        {
            warnings.Add(new CalcWarning
            {
                Code = "orphanQty",
                Message = $"{orphanRowIds.Count} 行工程量引用了库中不存在的定额编号，将不参与计算：{string.Join("、", orphanCodes)}",
                RowIds = orphanRowIds,
            });
        }
        if (invalidRowIds.Count > 0)
        {
            warnings.Add(new CalcWarning
            {
                Code = "invalidQty",
                Message = $"{invalidRowIds.Count} 行工程量数量/系数无效（数量<0 或系数<=0），将不参与计算",
                RowIds = invalidRowIds,
            });
        }
        foreach (var code in duplicateCodes)
        {
            warnings.Add(new CalcWarning
            {
                Code = "duplicateCode",
                Message = $"定额库中编号\"{code}\"重复，计算按首条匹配，请去重",
            });
        }

        // ---- 2. 表三甲：工日 ----
        var table3A = new List<Table3ARow>();
        decimal techSub = 0m, laborSub = 0m;
        foreach (var quota in quotas)
        {
            if (!byQuota.TryGetValue(quota.Code, out var agg) || agg.weighted == 0m) continue;
            var tech = R2(agg.weighted * Num(quota.Tech));
            var labor = R2(agg.weighted * Num(quota.Labor));
            techSub += tech;
            laborSub += labor;
            table3A.Add(new Table3ARow
            {
                Code = quota.Code,
                Name = quota.Name,
                Unit = quota.Unit,
                Qty = R2(agg.weighted),
                TechUnit = Num(quota.Tech),
                LaborUnit = Num(quota.Labor),
                Tech = tech,
                Labor = labor,
            });
        }
        var totalDays = techSub + laborSub;
        var adjRate = totalDays <= 100m ? 0.15m : totalDays <= 250m ? 0.1m : 0m;
        var techDays = techSub + techSub * adjRate;
        var laborDays = laborSub + laborSub * adjRate;

        // ---- 3. 表三乙/丙 ----
        var table3B = CalcEquip(quotas, libs.QuotaMachines ?? new List<QuotaMachine>(), machinePrice, byQuota);
        var table3C = CalcEquip(quotas, libs.QuotaInstruments ?? new List<QuotaMachine>(), instrumentPrice, byQuota);

        // ---- 4. 材料数量 ----
        var matQty = new Dictionary<string, (decimal auto, string supply)>();
        foreach (var rule in rules)
        {
            if (!quotaByCode.ContainsKey(rule.Quota)) continue;
            decimal q = 0m;
            if (rule.Kind == "变体")
            {
                q = Num(byVariant.TryGetValue($"{rule.Quota}|{rule.Variant ?? ""}", out var v) ? v : 0m);
            }
            else if (rule.Kind == "变体*")
            {
                var prefix = rule.Variant ?? "";
                decimal sum = 0m;
                foreach (var qq in quantities)
                {
                    if (qq.Quota == rule.Quota && Num(qq.Qty) > 0m && (qq.Variant ?? "").StartsWith(prefix))
                        sum += Num(qq.Qty);
                }
                q = sum;
            }
            else if (rule.Kind == "通用")
            {
                q = Num(byQuota.TryGetValue(rule.Quota, out var bv) ? bv.raw : 0m);
            }
            else if (rule.Kind == "备选")
            {
                if (ruleEnabled.TryGetValue(rule.Id ?? "", out var en) && en)
                    q = Num(byVariant.TryGetValue($"{rule.Quota}|{rule.Variant ?? ""}", out var v) ? v : 0m);
            }
            if (q == 0m) continue;
            var key = $"{rule.Material}|{rule.Spec}";
            if (!matQty.TryGetValue(key, out var cur))
            {
                cur = (0m, rule.Supply ?? "");
            }
            cur.auto += q * Num(rule.Consumption);
            matQty[key] = cur;
        }
        var adjustByKey = new Dictionary<string, decimal>();
        foreach (var a in project.MaterialAdjust ?? new List<MaterialAdjust>())
            adjustByKey[a.Key] = Num(a.Delta);
        var priceOverride = new Dictionary<string, decimal>();
        foreach (var p in project.PriceOverrides ?? new List<PriceOverride>())
            priceOverride[p.Key] = Num(p.PriceExcl);

        TableMatResult BuildMatTable(string supply)
        {
            var rows = new List<TableMatRow>();
            decimal totalExcl = 0m, totalVat = 0m;
            foreach (var kv in matQty)
            {
                var key = kv.Key;
                var v = kv.Value;
                matByKey.TryGetValue(key, out var lib);
                var libSupply = lib?.Supply ?? v.supply;
                if (libSupply != supply) continue;
                var parts = key.Split('|', 2);
                var name = parts[0];
                var spec = parts.Length > 1 ? parts[1] : "";
                var qty = v.auto + (adjustByKey.TryGetValue(key, out var d) ? d : 0m);
                if (qty == 0m) continue;
                decimal taxRate = supply == "甲供" ? jiaTax : supply == "乙供" ? yiTax : jiaTax;
                decimal priceExcl = priceOverride.TryGetValue(key, out var po) ? po : Num(lib?.PriceExcl);
                var priceVat = priceExcl * taxRate;
                var priceIncl = priceExcl + priceVat;
                var amtExcl = qty * priceExcl;
                var amtVat = qty * priceVat;
                totalExcl += amtExcl;
                totalVat += amtVat;
                rows.Add(new TableMatRow
                {
                    Key = key,
                    Name = name,
                    Spec = spec,
                    Unit = lib?.Unit ?? "",
                    Qty = R2(qty),
                    AutoQty = R2(v.auto),
                    Delta = adjustByKey.TryGetValue(key, out var d2) ? d2 : 0m,
                    PriceExcl = R2(priceExcl),
                    PriceVat = R2(priceVat),
                    PriceIncl = R2(priceIncl),
                    AmtExcl = R2(amtExcl),
                    AmtVat = R2(amtVat),
                    AmtIncl = R2(amtExcl + amtVat),
                    Unmatched = lib == null,
                });
            }
            return new TableMatResult
            {
                Rows = rows,
                TotalExcl = R2(totalExcl),
                TotalVat = R2(totalVat),
                TotalIncl = R2(totalExcl + totalVat),
            };
        }
        var table4A = BuildMatTable("甲供");
        var table4B = BuildMatTable("乙供");
        var table4Equip = BuildMatTable("设备");

        // ---- 5. 表二（折前）----
        var t2 = new Dictionary<string, decimal>();
        t2["techFee"] = R2(techDays * rateDict["techPrice"]);
        t2["laborFee"] = R2(laborDays * rateDict["laborPrice"]);
        t2["laborTotal"] = R2(t2["techFee"] + t2["laborFee"]);
        t2["jiaMat"] = table4A.TotalExcl;
        t2["yiMat"] = table4B.TotalExcl;
        t2["mainMat"] = R2(t2["jiaMat"] + t2["yiMat"]);
        t2["auxMat"] = R2(t2["mainMat"] * rateDict["auxRate"]);
        t2["matTotal"] = R2(t2["mainMat"] + t2["auxMat"]);
        t2["machineFee"] = table3B.Total;
        t2["instrumentFee"] = table3C.Total;
        t2["directFee"] = R2(t2["laborTotal"] + t2["matTotal"] + t2["machineFee"] + t2["instrumentFee"]);
        // 措施费
        t2["envFee"] = R2(t2["laborTotal"] * rateDict["envRate"]);
        t2["civilFee"] = R2(t2["laborTotal"] * rateDict["civilRate"]);
        t2["carryFee"] = R2(t2["laborTotal"] * rateDict["carryRate"]);
        t2["disturbFee"] = R2(t2["laborTotal"] * rateDict["disturbRate"]);
        t2["handoverFee"] = R2(t2["laborTotal"] * rateDict["handoverRate"]);
        var tempRate = info.施工距离 == "35KM以内" ? rateDict["tempNearRate"] : rateDict["tempFarRate"];
        t2["tempFee"] = R2(t2["laborTotal"] * tempRate);
        t2["vehicleFee"] = R2(t2["laborTotal"] * rateDict["vehicleRate"]);
        t2["nightFee"] = R2(t2["laborTotal"] * rateDict["nightRate"]);
        t2["winterFee"] = R2(t2["laborTotal"] * rateDict["winterRate"]);
        t2["toolFee"] = R2(t2["laborTotal"] * rateDict["toolRate"]);
        t2["utilityFee"] = R2(t2["laborTotal"] * rateDict["utilityRate"]);
        t2["specialFee"] = 0m;
        t2["protectFee"] = R2(t2["laborTotal"] * rateDict["protectRate"]);
        t2["earthFee"] = 0m;
        // 调遣费
        var dispatch = libs.Dispatch ?? Dispatch.Default();
        var mileage = Num(info.施工实际里程);
        decimal dispatchUnit;
        if (techDays == 0m)
        {
            dispatchUnit = 0m;
        }
        else
        {
            var baseUnit = ApproxLookup(mileage, dispatch.PriceTable);
            decimal extra = 0m;
            if (mileage > 4400m)
            {
                var steps = (decimal)System.Math.Ceiling((double)(mileage - 4400m) / 200.0);
                extra = steps * dispatch.ExtraPer200km;
            }
            dispatchUnit = baseUnit + extra;
        }
        bool isEquipDispatch = info.施工调遣分类 == "施工队伍调遣人数(无线、电源、设备）";
        decimal dispatchPeople;
        if (techDays == 0m)
        {
            dispatchPeople = 0m;
        }
        else
        {
            var basePeople = ApproxLookup(techDays, isEquipDispatch ? dispatch.PeopleEquip : dispatch.PeopleLine);
            decimal extraPeople = 0m;
            if (isEquipDispatch)
            {
                var diff = System.Math.Max(0m, techDays - 5000m);
                var steps = (decimal)System.Math.Ceiling((double)diff / 1000.0);
                extraPeople = steps * dispatch.ExtraPeopleStep;
            }
            else
            {
                var diff = System.Math.Max(0m, techDays - 30000m);
                var steps = (decimal)System.Math.Ceiling((double)diff / 5000.0);
                extraPeople = steps * dispatch.ExtraPeopleStep;
            }
            dispatchPeople = basePeople + extraPeople;
        }
        t2["dispatchUnit"] = dispatchUnit;
        t2["dispatchPeople"] = dispatchPeople;
        t2["dispatchFee"] = R2(dispatchUnit * dispatchPeople * 2m);
        t2["bigMachineFee"] = 0m;
        t2["measureFee"] = R2(
            t2["envFee"] + t2["civilFee"] + t2["carryFee"] + t2["disturbFee"] + t2["handoverFee"]
            + t2["tempFee"] + t2["vehicleFee"] + t2["nightFee"] + t2["winterFee"] + t2["toolFee"]
            + t2["utilityFee"] + t2["specialFee"] + t2["protectFee"] + t2["earthFee"]
            + t2["dispatchFee"] + t2["bigMachineFee"]);
        t2["directTotal"] = R2(t2["directFee"] + t2["measureFee"]);
        t2["sewageFee"] = 0m;
        t2["socialFee"] = R2(t2["laborTotal"] * rateDict["socialRate"]);
        t2["housingFee"] = R2(t2["laborTotal"] * rateDict["housingRate"]);
        t2["accidentFee"] = R2(t2["laborTotal"] * rateDict["accidentRate"]);
        t2["regFee"] = R2(t2["sewageFee"] + t2["socialFee"] + t2["housingFee"] + t2["accidentFee"]);
        t2["mgmtFee"] = R2(t2["laborTotal"] * rateDict["mgmtRate"]);
        t2["indirectTotal"] = R2(t2["regFee"] + t2["mgmtFee"]);
        t2["profit"] = R2(t2["laborTotal"] * rateDict["profitRate"]);
        t2["exclTax"] = R2(t2["directTotal"] + t2["indirectTotal"] + t2["profit"]);
        t2["outputTax"] = R2((t2["exclTax"] - t2["jiaMat"]) * outputTaxRate + table4A.TotalExcl * jiaTax);
        t2["inclTax"] = R2(t2["exclTax"] + t2["outputTax"]);
        var table2Before = t2;

        // ---- 6. 表二（折后）----
        var noDiscountKeys = libs.DiscountRule?.NoDiscountKeys ?? DiscountEngine.DefaultNoDiscountKeys.ToList();
        var zeroAfterDiscountKeys = libs.DiscountRule?.ZeroAfterDiscountKeys ?? DiscountEngine.DefaultZeroAfterDiscountKeys.ToList();
        var table2After = DiscountEngine.ApplyDiscount(
            table2Before, discount, noDiscountKeys, zeroAfterDiscountKeys, outputTaxRate, jiaTax);

        // ---- 7. 表五 ----
        var table5Fees = (libs.Table5Fees != null && libs.Table5Fees.Count > 0)
            ? libs.Table5Fees
            : Table5Config.DefaultFees();
        var table5 = CalcTable5(
            table2Before, table2After, surveyKm,
            table5Fees, project.Table5Overrides, safetyVatFallback, warnings);

        // ---- 8. 表一 ----
        var t1 = new Table1Result
        {
            BeforeDiscount = table2Before["exclTax"],
            AfterDiscount = table2After["exclTax"],
            TaxBefore = table2Before["outputTax"],
            TaxAfter = table2After["outputTax"],
            TotalBefore = R2(table2Before["exclTax"] + table2Before["outputTax"]),
            TotalAfter = R2(table2After["exclTax"] + table2After["outputTax"]),
            OtherFee = table5.TotalExcl,
            OtherVat = table5.TotalVat,
            OtherIncl = table5.TotalIncl,
        };
        t1.SumExcl = R2(t1.AfterDiscount + t1.OtherFee);
        t1.SumVat = R2(t1.TaxAfter + t1.OtherVat);
        t1.SumIncl = R2(t1.SumExcl + t1.SumVat);
        t1.EquipFee = table4Equip.TotalExcl;
        t1.EquipVat = table4Equip.TotalVat;
        t1.EquipIncl = table4Equip.TotalIncl;
        t1.GrandExcl = R2(t1.SumExcl + t1.EquipFee);
        t1.GrandVat = R2(t1.SumVat + t1.EquipVat);
        t1.GrandIncl = R2(t1.SumIncl + t1.EquipIncl);

        // ---- 9. 汇总表 ----
        var summary = new SummaryResult
        {
            ConstructionExcl = t1.AfterDiscount,
            ConstructionVat = t1.TaxAfter,
            ConstructionIncl = R2(t1.AfterDiscount + t1.TaxAfter),
            Other = table5.TotalExcl,
            OtherVat = table5.TotalVat,
            OtherIncl = table5.TotalIncl,
        };
        summary.TotalExcl = R2(summary.ConstructionExcl + summary.Other);
        summary.TotalVat = R2(summary.ConstructionVat + summary.OtherVat);
        summary.TotalIncl = R2(summary.TotalExcl + summary.TotalVat);

        return new CalcResult
        {
            Info = info,
            Rate = rateDict,
            TechSub = R2(techSub),
            LaborSub = R2(laborSub),
            AdjRate = adjRate,
            TechDays = R2(techDays),
            LaborDays = R2(laborDays),
            Table3A = table3A,
            Table3B = table3B,
            Table3C = table3C,
            Table4A = table4A,
            Table4B = table4B,
            Table4Equip = table4Equip,
            Table2Before = table2Before,
            Table2After = table2After,
            Table5 = table5,
            Table1 = t1,
            Summary = summary,
            Warnings = warnings,
            Discount = discount,
            DiscountRule = new DiscountRuleInfo
            {
                DiscountRate = discount,
                NoDiscountKeys = noDiscountKeys.ToList(),
                ZeroAfterDiscountKeys = zeroAfterDiscountKeys.ToList(),
            },
            SurveyKm = R2(surveyKm),
            SurveyRaw = R2(surveyRaw),
        };
    }

    // ---------- helpers ----------
    private static TableEquipResult CalcEquip(
        List<Quota> quotas,
        List<QuotaMachine> mappings,
        Dictionary<string, decimal> priceMap,
        Dictionary<string, (decimal raw, decimal weighted)> byQuota)
    {
        var byQuotaMap = new Dictionary<string, List<QuotaMachine>>();
        foreach (var m in mappings)
        {
            if (!byQuotaMap.TryGetValue(m.Quota, out var list))
            {
                list = new List<QuotaMachine>();
                byQuotaMap[m.Quota] = list;
            }
            list.Add(m);
        }
        var rows = new List<TableEquipRow>();
        decimal total = 0m;
        foreach (var quota in quotas)
        {
            if (!byQuota.TryGetValue(quota.Code, out var agg) || agg.weighted == 0m) continue;
            if (!byQuotaMap.TryGetValue(quota.Code, out var ms)) continue;
            foreach (var m in ms)
            {
                var sessions = agg.weighted * Num(m.Qty);
                var price = priceMap.TryGetValue(m.MCode, out var p) ? p : 0m;
                var amount = sessions * price;
                total += amount;
                rows.Add(new TableEquipRow
                {
                    Quota = quota.Code,
                    QuotaName = quota.Name,
                    Unit = quota.Unit,
                    Qty = R2(agg.weighted),
                    EquipName = m.MName ?? "",
                    EquipUnit = m.Unit ?? "",
                    Consumption = Num(m.Qty),
                    Price = price,
                    Sessions = R2(sessions),
                    Amount = R2(amount),
                });
            }
        }
        return new TableEquipResult { Rows = rows, Total = R2(total) };
    }

    private static Table5Result CalcTable5(
        Dictionary<string, decimal> table2Before,
        Dictionary<string, decimal> table2After,
        decimal surveyKm,
        List<Table5Config.Table5Fee> feesConfig,
        List<Table5Override>? overrides,
        decimal safetyVatFallback,
        List<CalcWarning> warnings)
    {
        var overridesByKey = new Dictionary<string, Table5Override>();
        foreach (var o in overrides ?? new List<Table5Override>())
            overridesByKey[o.Key] = o;
        var sorted = feesConfig.OrderBy(a => a.Order).ToList();
        var rows = new List<Table5Row>();
        var byKey = new Dictionary<string, Table5Row>();
        foreach (var item in sorted)
        {
            overridesByKey.TryGetValue(item.Key, out var ov);
            bool enabled = ov?.Enabled ?? item.Enabled;
            if (!enabled) continue;
            var row = new Table5Row
            {
                Key = item.Key,
                Name = item.Name,
                Basis = item.Basis,
                Rate = item.Rate,
                VatRate = item.VatRate,
                Order = item.Order,
                Note = item.Note ?? "",
                Enabled = true,
            };
            // 暂存 item 用于后续 basis 计算
            row.Rate = item.Rate;
            rows.Add(row);
            byKey[item.Key] = row;
        }
        // 除税价
        foreach (var row in rows)
        {
            var item = feesConfig.First(a => a.Key == row.Key);
            var ov = overridesByKey.TryGetValue(row.Key, out var o) ? o : null;
            if (ov != null && ov.Amount.HasValue)
            {
                row.Excl = R2(Num(ov.Amount));
            }
            else if (row.Basis == "preDiscountExclTax") row.Excl = R2(table2Before["exclTax"] * Num(row.Rate));
            else if (row.Basis == "afterDiscountExclTax") row.Excl = R2(table2After["exclTax"] * Num(row.Rate));
            else if (row.Basis == "laborTotal") row.Excl = R2(table2Before["laborTotal"] * Num(row.Rate));
            else if (row.Basis == "fixed") row.Excl = R2(Num(item.Amount));
            else if (row.Basis == "manual") row.Excl = R2(Num(item.Amount));
            else if (row.Basis == "surveyKm") row.Excl = R2(SurveyFeeFor(surveyKm));
            else if (row.Basis == "sum")
            {
                row.Excl = 0m; // 稍后填充
            }
            else
            {
                warnings.Add(new CalcWarning
                {
                    Code = "unknownTable5Basis",
                    Message = $"表五费用项\"{row.Name}\"的 basis\"{row.Basis}\"未知，按 0 计算",
                });
                row.Excl = 0m;
            }
        }
        // sum 行：子项和
        foreach (var row in rows)
        {
            if (row.Basis == "sum")
            {
                var item = feesConfig.First(a => a.Key == row.Key);
                var children = item.Children ?? new List<string>();
                if (row.Key == "designTotal" && children.Count == 0)
                    children = new List<string> { "surveyFee", "designFee" };
                row.Excl = R2(children.Sum(k => byKey.TryGetValue(k, out var cr) ? cr.Excl : 0m));
            }
        }
        // 增值税 + 含税
        foreach (var row in rows)
        {
            var item = feesConfig.First(a => a.Key == row.Key);
            decimal vr = item.VatRate ?? (row.Key == "safetyFee" ? safetyVatFallback : 0m);
            row.VatRate = vr;
            row.Vat = R2(row.Excl * vr);
            row.Incl = R2(row.Excl + row.Vat);
            row.Amount = row.Excl;
        }
        // 总计
        var sumChildren = new HashSet<string>();
        foreach (var row in rows)
        {
            if (row.Basis == "sum")
            {
                var item = feesConfig.First(a => a.Key == row.Key);
                var children = item.Children ?? new List<string>();
                if (row.Key == "designTotal" && children.Count == 0)
                    children = new List<string> { "surveyFee", "designFee" };
                foreach (var k in children) sumChildren.Add(k);
            }
        }
        var totalRows = rows.Where(r => !sumChildren.Contains(r.Key) && r.Key != "productionPrepFee").ToList();
        var totalExcl = R2(totalRows.Sum(r => r.Excl));
        var totalVat = R2(totalRows.Sum(r => r.Vat));
        var totalIncl = R2(totalExcl + totalVat);

        var get = (string k) => byKey.TryGetValue(k, out var v) ? v : null;
        var f = (string k, string field) => get(k) switch
        {
            { } rr => field switch
            {
                "excl" => rr.Excl,
                "vat" => rr.Vat,
                "incl" => rr.Incl,
                _ => 0m,
            },
            _ => 0m,
        };
        var pp = get("productionPrepFee");

        return new Table5Result
        {
            Rows = rows,
            TotalExcl = totalExcl,
            TotalVat = totalVat,
            TotalIncl = totalIncl,
            Mgmt2 = f("mgmt2", "excl"),
            Mgmt2Vat = f("mgmt2", "vat"),
            Mgmt2Incl = f("mgmt2", "incl"),
            SurveyKm = R2(surveyKm),
            SurveyFee = f("surveyFee", "excl"),
            SurveyVat = f("surveyFee", "vat"),
            DesignFee = f("designFee", "excl"),
            DesignVat = f("designFee", "vat"),
            DesignTotal = f("designTotal", "excl"),
            DesignTotalVat = f("designTotal", "vat"),
            SafetyFee = f("safetyFee", "excl"),
            SafetyVat = f("safetyFee", "vat"),
            SafetyIncl = f("safetyFee", "incl"),
            ProductionPrepFee = pp?.Excl ?? 0m,
            ProductionPrepVat = pp?.Vat ?? 0m,
            ProductionPrepIncl = pp?.Incl ?? 0m,
        };
    }

    /// <summary>
    /// 勘察费分段（v1 公式保留，§7.3）。勘察长度 = 测量类定额原量 / 10。
    /// </summary>
    private static decimal SurveyFeeFor(decimal surveyKm)
    {
        if (surveyKm <= 0m) return 0m;
        if (surveyKm <= 1m) return 2000m * 0.8m;
        if (surveyKm <= 10m) return (2000m + (surveyKm - 1m) * 1530m) * 0.8m;
        if (surveyKm <= 50m) return (15770m + (surveyKm - 10m) * 1130m) * 0.8m;
        return surveyKm * 1219.4m * 0.8m;
    }

    /// <summary>
    /// Excel HLOOKUP 近似匹配：取 &lt;= key 的最大阈值对应的值。
    /// </summary>
    private static decimal ApproxLookup(decimal key, List<(decimal threshold, decimal value)> table)
    {
        decimal v = table[0].value;
        foreach (var (t, val) in table)
        {
            if (key >= t) v = val;
            else break;
        }
        return v;
    }

    private static decimal Num(decimal? v) => v ?? 0m;

    private static decimal CoerceDecimal(object? obj)
    {
        if (obj == null) return 0m;
        if (obj is decimal d) return d;
        if (obj is double dd) return (decimal)dd;
        if (obj is int i) return (decimal)i;
        if (obj is long l) return (decimal)l;
        if (obj is string s && decimal.TryParse(s, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var dv)) return dv;
        if (obj is bool b) return b ? 1m : 0m;
        return 0m;
    }

    public static decimal R2(decimal x) => DiscountEngine.R2(x);

    /// <summary>
    /// 取值优先级（§2.4）：工程 rateOverrides（非 null）> 工程 info > 配置方案 rates / discountRule > 兜底。
    /// </summary>
    private static ResolvedRates ResolveRates(LibrarySet libs, Project project)
    {
        var info = project.Info ?? new ProjectInfo();
        var ro = project.RateOverrides ?? new RateOverrides();
        var vat = libs.Rates?.VatRates ?? new VatRates();
        var rule = libs.DiscountRule ?? new DiscountRule();
        decimal Pick(decimal? roVal, decimal? infoVal, decimal? profileVal, decimal fallback)
        {
            if (roVal.HasValue) return roVal.Value;
            if (infoVal.HasValue) return infoVal.Value;
            if (profileVal.HasValue) return profileVal.Value;
            return fallback;
        }
        return new ResolvedRates
        {
            Discount = Pick(ro.Discount, info.施工折扣, rule.DiscountRate, 1m),
            JiaTax = Pick(ro.JiaTax, info.甲供增值税, vat.JiaTax, 0.13m),
            YiTax = Pick(ro.YiTax ?? ro.TaxRate, info.乙供增值税, vat.YiTax, 0.09m),
            OutputTax = Pick(ro.OutputTax ?? ro.TaxRate, info.乙供增值税, vat.OutputTax ?? vat.YiTax, 0.09m),
            SafetyVat = Pick(ro.SafetyVat, null, vat.SafetyVat, 0m),
        };
    }

    private class ResolvedRates
    {
        public decimal Discount { get; set; }
        public decimal JiaTax { get; set; }
        public decimal YiTax { get; set; }
        public decimal OutputTax { get; set; }
        public decimal SafetyVat { get; set; }
    }
}