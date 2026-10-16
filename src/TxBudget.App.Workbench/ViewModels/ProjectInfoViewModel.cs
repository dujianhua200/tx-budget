using System.Collections.ObjectModel;
using System.Linq;
using TxBudget.Core.Model;

namespace TxBudget.App.Workbench.ViewModels;

/// <summary>
/// 工程信息 Tab：建设单位、工程类型、施工折扣、税率等。
/// </summary>
public class ProjectInfoViewModel : WorkbenchTabViewModel
{
    public ProjectInfoViewModel()
    {
        Title = "工程信息";
    }

    public override void Refresh()
    {
        base.Refresh();
        OnPropertyChanged(nameof(建设单位));
        OnPropertyChanged(nameof(建设项目名称));
        OnPropertyChanged(nameof(单项工程名称));
        OnPropertyChanged(nameof(合同编号));
        OnPropertyChanged(nameof(工程类型));
        OnPropertyChanged(nameof(施工折扣));
        OnPropertyChanged(nameof(甲供增值税));
        OnPropertyChanged(nameof(乙供增值税));
        OnPropertyChanged(nameof(冬雨季施工费));
        OnPropertyChanged(nameof(施工距离));
        OnPropertyChanged(nameof(施工实际里程));
        OnPropertyChanged(nameof(施工调遣分类));
    }

    public string? 建设单位
    {
        get => Host?.CurrentProject?.Info?.建设单位;
        set { if (Host?.CurrentProject?.Info != null) { Host.CurrentProject.Info.建设单位 = value; MarkDirty(); } }
    }
    public string? 建设项目名称
    {
        get => Host?.CurrentProject?.Info?.建设项目名称;
        set { if (Host?.CurrentProject?.Info != null) { Host.CurrentProject.Info.建设项目名称 = value; MarkDirty(); } }
    }
    public string? 单项工程名称
    {
        get => Host?.CurrentProject?.Info?.单项工程名称;
        set { if (Host?.CurrentProject?.Info != null) { Host.CurrentProject.Info.单项工程名称 = value; MarkDirty(); } }
    }
    public string? 合同编号
    {
        get => Host?.CurrentProject?.Info?.合同编号;
        set { if (Host?.CurrentProject?.Info != null) { Host.CurrentProject.Info.合同编号 = value; MarkDirty(); } }
    }
    public string? 工程类型
    {
        get => Host?.CurrentProject?.Info?.工程类型;
        set { if (Host?.CurrentProject?.Info != null) { Host.CurrentProject.Info.工程类型 = value; MarkDirty(); Refresh(); } }
    }

    public System.Collections.Generic.IList<string> 工程类型Options { get; } =
        TxBudget.Core.Engine.RateResolver.ProjectTypes.ToList();

    public decimal? 施工折扣
    {
        get => Host?.CurrentProject?.Info?.施工折扣;
        set { if (Host?.CurrentProject?.Info != null) { Host.CurrentProject.Info.施工折扣 = value; MarkDirty(); } }
    }
    public decimal? 甲供增值税
    {
        get => Host?.CurrentProject?.Info?.甲供增值税;
        set { if (Host?.CurrentProject?.Info != null) { Host.CurrentProject.Info.甲供增值税 = value; MarkDirty(); } }
    }
    public decimal? 乙供增值税
    {
        get => Host?.CurrentProject?.Info?.乙供增值税;
        set { if (Host?.CurrentProject?.Info != null) { Host.CurrentProject.Info.乙供增值税 = value; MarkDirty(); } }
    }
    public string? 冬雨季施工费
    {
        get => Host?.CurrentProject?.Info?.冬雨季施工费;
        set { if (Host?.CurrentProject?.Info != null) { Host.CurrentProject.Info.冬雨季施工费 = value; MarkDirty(); } }
    }
    public string? 施工距离
    {
        get => Host?.CurrentProject?.Info?.施工距离;
        set { if (Host?.CurrentProject?.Info != null) { Host.CurrentProject.Info.施工距离 = value; MarkDirty(); } }
    }
    public decimal? 施工实际里程
    {
        get => Host?.CurrentProject?.Info?.施工实际里程;
        set { if (Host?.CurrentProject?.Info != null) { Host.CurrentProject.Info.施工实际里程 = value; MarkDirty(); } }
    }
    public string? 施工调遣分类
    {
        get => Host?.CurrentProject?.Info?.施工调遣分类;
        set { if (Host?.CurrentProject?.Info != null) { Host.CurrentProject.Info.施工调遣分类 = value; MarkDirty(); } }
    }
}
