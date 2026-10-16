using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace TxBudget.App.Workbench.ViewModels;

/// <summary>
/// 工作台 Tab 基类。统一订阅主窗口的 RecomputeRequested + 工程切换。
/// </summary>
public abstract class WorkbenchTabViewModel : INotifyPropertyChanged
{
    public string Title { get; protected set; } = "";

    private ViewModels.MainWindowViewModel? _host;

    public void Attach(ViewModels.MainWindowViewModel host)
    {
        if (_host != null)
        {
            _host.RecomputeRequested -= OnRecomputeRequested;
            _host.PropertyChanged -= OnHostPropertyChanged;
        }
        _host = host;
        _host.RecomputeRequested += OnRecomputeRequested;
        _host.PropertyChanged += OnHostPropertyChanged;
        Refresh();
    }

    protected ViewModels.MainWindowViewModel? Host => _host;

    /// <summary>主窗口工程或路径变化时调用。</summary>
    public virtual void Refresh()
    {
        OnPropertyChanged(nameof(Title));
    }

    protected virtual void OnRecomputeRequested(object? sender, System.EventArgs e) => Refresh();

    protected virtual void OnHostPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(ViewModels.MainWindowViewModel.CurrentProject)
            || e.PropertyName == nameof(ViewModels.MainWindowViewModel.ProjectPath))
        {
            Refresh();
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name ?? ""));

    protected void MarkDirty() => _host?.MarkDirty();
}