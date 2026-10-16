using System.Collections.Concurrent;
using TxBudget.Batch.Models;
using TxBudget.Core.Engine;
using TxBudget.Core.Model;

namespace TxBudget.Batch;

/// <summary>
/// 批量项目生成器：将工作量表转换为引擎 Project，调用 CalcEngine 计算。
/// </summary>
public class BatchProjectGenerator
{
    private readonly LibrarySet _libs;

    public BatchProjectGenerator(LibrarySet libs)
    {
        _libs = libs ?? throw new ArgumentNullException(nameof(libs));
    }

    /// <summary>
    /// 单张工作量表 → 一个计算结果。
    /// </summary>
    public BatchProjectResult Generate(WorkloadTable table, ProjectInfo? templateInfo = null)
    {
        try
        {
            var info = ProjectInfo.MergeDefaults(templateInfo ?? new ProjectInfo());
            if (!string.IsNullOrEmpty(table.ProjectType))
            {
                info.工程类型 = table.ProjectType;
            }
            if (!string.IsNullOrEmpty(table.ProjectName))
            {
                info.建设项目名称 = table.ProjectName;
            }

            var quantities = new List<QuantityRow>();
            var warnings = new List<string>();

            foreach (var row in table.Rows)
            {
                if (string.IsNullOrWhiteSpace(row.QuotaCode))
                {
                    warnings.Add($"行 {row.Id} 缺少定额编号，已跳过。");
                    continue;
                }

                // 校验定额编号在库中是否存在（非强制，仅警告）
                bool quotaExists = _libs.Quotas?.Any(q =>
                    q.Code.Equals(row.QuotaCode, StringComparison.OrdinalIgnoreCase)) ?? false;
                if (!quotaExists)
                {
                    warnings.Add($"定额编号 {row.QuotaCode} 在定额库中未找到。");
                }

                quantities.Add(new QuantityRow
                {
                    Id = row.Id,
                    Quota = row.QuotaCode,
                    Variant = row.Variant,
                    Unit = row.Unit,
                    Qty = row.Quantity,
                    Coef = row.Coefficient,
                });
            }

            var project = new Project
            {
                Info = info,
                Quantities = quantities,
            };

            var result = CalcEngine.CalcProject(project, _libs);

            // 合并引擎警告
            if (result.Warnings != null)
            {
                foreach (var w in result.Warnings)
                {
                    warnings.Add($"[{w.Code}] {w.Message}");
                }
            }

            return new BatchProjectResult
            {
                ProjectName = info.建设项目名称 ?? table.SheetName,
                Project = project,
                CalcResult = result,
                Warnings = warnings,
                Success = true,
            };
        }
        catch (Exception ex)
        {
            return new BatchProjectResult
            {
                ProjectName = table.ProjectName ?? table.SheetName,
                Success = false,
                ErrorMessage = ex.Message,
            };
        }
    }

    /// <summary>
    /// 批量生成：多张工作量表 → 多个计算结果。
    /// 当表数量 > 100 时采用分批并行（每批 100 个），避免内存峰值过高。
    /// </summary>
    public BatchGenerateResult GenerateAll(List<WorkloadTable> tables, ProjectInfo? templateInfo = null)
    {
        var overall = new BatchGenerateResult();
        if (tables == null || tables.Count == 0)
            return overall;

        const int parallelThreshold = 100;
        const int batchSize = 100;

        if (tables.Count <= parallelThreshold)
        {
            // 小批量：直接并行
            var results = new ConcurrentBag<(int Index, BatchProjectResult Result)>();
            Parallel.ForEach(tables.Select((t, i) => (Index: i, Table: t)), pair =>
            {
                var result = Generate(pair.Table, templateInfo);
                results.Add((pair.Index, result));
            });
            var ordered = results.OrderBy(r => r.Index).Select(r => r.Result).ToList();
            overall.Projects.AddRange(ordered);
        }
        else
        {
            // 大批量：分批并行，控制内存
            for (int i = 0; i < tables.Count; i += batchSize)
            {
                var batch = tables.Skip(i).Take(batchSize).Select((t, idx) => (Index: i + idx, Table: t)).ToList();
                var results = new ConcurrentBag<(int Index, BatchProjectResult Result)>();
                Parallel.ForEach(batch, pair =>
                {
                    var result = Generate(pair.Table, templateInfo);
                    results.Add((pair.Index, result));
                });
                var ordered = results.OrderBy(r => r.Index).Select(r => r.Result).ToList();
                overall.Projects.AddRange(ordered);
            }
        }

        return overall;
    }
}
