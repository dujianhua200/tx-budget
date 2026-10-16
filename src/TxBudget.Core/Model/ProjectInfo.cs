namespace TxBudget.Core.Model;

/// <summary>
/// 工程基本信息（移植自 calc.mjs DEFAULT_INFO）。
/// </summary>
public class ProjectInfo
{
    public string? 建设单位 { get; set; }
    public string? 建设项目名称 { get; set; }
    public string? 单项工程名称 { get; set; }
    public string? 合同编号 { get; set; }
    public string? 工程类型 { get; set; } = "通信线路工程";
    public string? 区县 { get; set; }
    public string? 编制日期 { get; set; }
    public decimal? 施工折扣 { get; set; } = 1m;
    public string? 段落起点 { get; set; }
    public string? 段落终点 { get; set; }
    public string? 监理单位 { get; set; }
    public string? 表格编号 { get; set; } = "YD-";
    public string? 单段工程名称 { get; set; }
    public string? 项目编号 { get; set; }
    public string? 施工距离 { get; set; } = "35KM以内";
    public decimal? 施工实际里程 { get; set; }
    public string? 施工调遣分类 { get; set; } = "施工队伍调遣人数(线路、管道）";
    public decimal? 施工现场海拔 { get; set; }
    public string? 冬雨季施工费 { get; set; } = "Ⅲ类地区";
    public decimal? 甲供增值税 { get; set; } = 0.13m;
    public decimal? 乙供增值税 { get; set; } = 0.09m;
    public string? 工程负责人 { get; set; }
    public string? 审核 { get; set; }
    public string? 编制 { get; set; }

    /// <summary>
    /// 与 JS DEFAULT_INFO 合并默认值（项目未提供的字段采用默认）。
    /// </summary>
    public static ProjectInfo MergeDefaults(ProjectInfo? src)
    {
        var d = new ProjectInfo();
        if (src == null) return d;
        if (src.建设单位 != null) d.建设单位 = src.建设单位;
        if (src.建设项目名称 != null) d.建设项目名称 = src.建设项目名称;
        if (src.单项工程名称 != null) d.单项工程名称 = src.单项工程名称;
        if (src.合同编号 != null) d.合同编号 = src.合同编号;
        if (src.工程类型 != null) d.工程类型 = src.工程类型;
        if (src.区县 != null) d.区县 = src.区县;
        if (src.编制日期 != null) d.编制日期 = src.编制日期;
        if (src.施工折扣.HasValue) d.施工折扣 = src.施工折扣;
        if (src.段落起点 != null) d.段落起点 = src.段落起点;
        if (src.段落终点 != null) d.段落终点 = src.段落终点;
        if (src.监理单位 != null) d.监理单位 = src.监理单位;
        if (src.表格编号 != null) d.表格编号 = src.表格编号;
        if (src.单段工程名称 != null) d.单段工程名称 = src.单段工程名称;
        if (src.项目编号 != null) d.项目编号 = src.项目编号;
        if (src.施工距离 != null) d.施工距离 = src.施工距离;
        if (src.施工实际里程.HasValue) d.施工实际里程 = src.施工实际里程;
        if (src.施工调遣分类 != null) d.施工调遣分类 = src.施工调遣分类;
        if (src.施工现场海拔.HasValue) d.施工现场海拔 = src.施工现场海拔;
        if (src.冬雨季施工费 != null) d.冬雨季施工费 = src.冬雨季施工费;
        if (src.甲供增值税.HasValue) d.甲供增值税 = src.甲供增值税;
        if (src.乙供增值税.HasValue) d.乙供增值税 = src.乙供增值税;
        if (src.工程负责人 != null) d.工程负责人 = src.工程负责人;
        if (src.审核 != null) d.审核 = src.审核;
        if (src.编制 != null) d.编制 = src.编制;
        return d;
    }
}