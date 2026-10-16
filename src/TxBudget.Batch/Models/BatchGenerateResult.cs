using TxBudget.Core.Engine;
using TxBudget.Core.Model;

namespace TxBudget.Batch.Models;

/// <summary>
/// 批量生成结果：一个工作量表对应一个项目及计算结果。
/// </summary>
public class BatchProjectResult
{
    public string? ProjectName { get; set; }
    public Project? Project { get; set; }
    public CalcResult? CalcResult { get; set; }
    public List<string> Warnings { get; set; } = new();
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// 批量生成总结果。
/// </summary>
public class BatchGenerateResult
{
    public List<BatchProjectResult> Projects { get; set; } = new();
    public int SuccessCount => Projects.Count(p => p.Success);
    public int FailCount => Projects.Count(p => !p.Success);
    public List<string> GlobalErrors { get; set; } = new();
}
