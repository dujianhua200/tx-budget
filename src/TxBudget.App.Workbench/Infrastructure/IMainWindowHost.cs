using System.ComponentModel;
using TxBudget.Core.Model;

namespace TxBudget.App.Workbench.Infrastructure;

/// <summary>
/// 主窗口宿主接口：供 Workbench ViewModel 解耦使用。
/// </summary>
public interface IMainWindowHost : INotifyPropertyChanged
{
    Project? CurrentProject { get; }
    LibrarySet? CurrentLibs { get; }
    string? ProjectPath { get; }
    string StatusMessage { get; set; }
    bool IsDirty { get; }

    event System.EventHandler? RecomputeRequested;

    void MarkDirty();
}
