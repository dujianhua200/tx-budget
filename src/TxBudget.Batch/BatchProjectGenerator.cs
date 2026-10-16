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
    /// </summary>
    public BatchGenerateResult GenerateAll(List<WorkloadTable> tables, ProjectInfo? templateInfo = null)
    {
        var overall = new BatchGenerateResult();
        foreach (var table in tables)
        {
            overall.Projects.Add(Generate(table, templateInfo));
        }
        return overall;
    }
}
