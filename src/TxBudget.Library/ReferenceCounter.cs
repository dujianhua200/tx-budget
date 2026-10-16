using TxBudget.Core.Model;

namespace TxBudget.Library;

/// <summary>
/// 引用计数器：分析库数据之间的引用关系，用于删除前的影响评估。
/// </summary>
public class ReferenceCounter
{
    private readonly LibrarySet _libs;

    public ReferenceCounter(LibrarySet libs)
    {
        _libs = libs;
    }

    /// <summary>
    /// 统计某个定额被哪些材料规则引用。
    /// </summary>
    public List<string> QuotaReferencedByRules(string quotaCode)
    {
        return _libs.Rules?
            .Where(r => r.Quota == quotaCode)
            .Select(r => $"{r.Material} ({r.Spec})")
            .ToList() ?? new List<string>();
    }

    /// <summary>
    /// 统计某个定额被哪些机械/仪表关联。
    /// </summary>
    public List<string> QuotaReferencedByMachines(string quotaCode)
    {
        var machines = _libs.QuotaMachines?.Where(m => m.Quota == quotaCode).Select(m => $"机械 {m.MCode}").ToList() ?? new();
        var instruments = _libs.QuotaInstruments?.Where(m => m.Quota == quotaCode).Select(m => $"仪表 {m.MCode}").ToList() ?? new();
        machines.AddRange(instruments);
        return machines;
    }

    /// <summary>
    /// 统计某个材料被哪些规则引用。
    /// </summary>
    public List<string> MaterialReferencedByRules(string materialName, string spec)
    {
        return _libs.Rules?
            .Where(r => r.Material == materialName && r.Spec == spec)
            .Select(r => $"定额 {r.Quota}")
            .ToList() ?? new List<string>();
    }

    /// <summary>
    /// 统计某个机械/仪表价格被哪些定额引用。
    /// </summary>
    public List<string> MachineReferencedByQuotas(string machineCode)
    {
        var machines = _libs.QuotaMachines?.Where(m => m.MCode == machineCode).Select(m => $"定额 {m.Quota}").ToList() ?? new();
        var instruments = _libs.QuotaInstruments?.Where(m => m.MCode == machineCode).Select(m => $"定额 {m.Quota}").ToList() ?? new();
        machines.AddRange(instruments);
        return machines;
    }

    /// <summary>
    /// 评估删除某个定额的影响。
    /// </summary>
    public DeleteImpact AssessQuotaDelete(string quotaCode)
    {
        var rules = QuotaReferencedByRules(quotaCode);
        var machines = QuotaReferencedByMachines(quotaCode);
        return new DeleteImpact
        {
            Target = $"定额 {quotaCode}",
            ReferencedBy = rules.Concat(machines).ToList(),
            CanDelete = rules.Count == 0 && machines.Count == 0,
        };
    }

    /// <summary>
    /// 评估删除某个材料的影响。
    /// </summary>
    public DeleteImpact AssessMaterialDelete(string name, string spec)
    {
        var refs = MaterialReferencedByRules(name, spec);
        return new DeleteImpact
        {
            Target = $"材料 {name} ({spec})",
            ReferencedBy = refs,
            CanDelete = refs.Count == 0,
        };
    }

    /// <summary>
    /// 评估删除某个机械/仪表价格的影响。
    /// </summary>
    public DeleteImpact AssessMachineDelete(string code)
    {
        var refs = MachineReferencedByQuotas(code);
        return new DeleteImpact
        {
            Target = $"机械/仪表 {code}",
            ReferencedBy = refs,
            CanDelete = refs.Count == 0,
        };
    }
}

public class DeleteImpact
{
    public string Target { get; set; } = "";
    public List<string> ReferencedBy { get; set; } = new();
    public bool CanDelete { get; set; }
    public string WarningMessage => CanDelete
        ? $"{Target} 可以安全删除。"
        : $"{Target} 被 {ReferencedBy.Count} 处引用，删除后将影响：{string.Join("、", ReferencedBy.Take(5))}";
}
