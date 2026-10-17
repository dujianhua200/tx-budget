using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using System.Windows.Input;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Platform.Storage;
using MsBox.Avalonia;
using MsBox.Avalonia.Enums;
using TxBudget.App.Infrastructure;
using TxBudget.App.Workbench.Infrastructure;
using TxBudget.App.Workbench.ViewModels;
using TxBudget.Core.Model;

namespace TxBudget.App.ViewModels;

/// <summary>
/// 主窗口 ViewModel：菜单 / 工具栏命令 + 工程管理 + 自动备份协调。
/// </summary>
public class MainWindowViewModel : IMainWindowHost, INotifyPropertyChanged
{
    public ObservableCollection<NavItem> Navigation { get; } = new();
    public ObservableCollection<WorkbenchTabViewModel> OpenTabs { get; } = new();

    public ICommand NewCommand { get; }
    public ICommand OpenCommand { get; }
    public ICommand SaveCommand { get; }
    public ICommand SaveAsCommand { get; }
    public ICommand CloseProjectCommand { get; }
    public ICommand ExitCommand { get; }
    public ICommand UndoCommand { get; }
    public ICommand RedoCommand { get; }
    public ICommand FindCommand { get; }
    public ICommand ReplaceCommand { get; }
    public ICommand ShowProjectInfoCommand { get; }
    public ICommand ShowRateTemplateCommand { get; }
    public ICommand RecomputeCommand { get; }
    public ICommand ShowTable3ACommand { get; }
    public ICommand ShowTable3BCommand { get; }
    public ICommand ShowTable3CCommand { get; }
    public ICommand ShowTable4ACommand { get; }
    public ICommand ShowTable4BCommand { get; }
    public ICommand ShowTable2Command { get; }
    public ICommand ShowTable1Command { get; }
    public ICommand ShowTable5Command { get; }
    public ICommand ShowSummaryCommand { get; }
    public ICommand ShowRatesCommand { get; }
    public ICommand ShowDiscountCommand { get; }
    public ICommand ShowTable5ConfigCommand { get; }
    public ICommand ShowAboutCommand { get; }
    public ICommand CloseTabCommand { get; }

    public MainWindowViewModel()
    {
        Navigation.Add(new NavItem("工程信息", () => OpenTab(new ProjectInfoViewModel())));
        Navigation.Add(new NavItem("表三甲·定额", () => OpenTab(new Table3AViewModel())));
        Navigation.Add(new NavItem("表三乙·机械台班", () => OpenTab(new Table3BViewModel())));
        Navigation.Add(new NavItem("表三丙·仪器仪表", () => OpenTab(new Table3CViewModel())));
        Navigation.Add(new NavItem("表四甲·材料汇总", () => OpenTab(new Table4AViewModel())));
        Navigation.Add(new NavItem("表四乙·乙供材料", () => OpenTab(new Table4BViewModel())));
        Navigation.Add(new NavItem("双表二·取费", () => OpenTab(new Table2ViewModel())));
        Navigation.Add(new NavItem("表一·预算汇总", () => OpenTab(new Table1ViewModel())));
        Navigation.Add(new NavItem("表五甲·其他费用", () => OpenTab(new Table5ViewModel())));
        Navigation.Add(new NavItem("汇总表", () => OpenTab(new SummaryViewModel())));

        NewCommand = new AsyncRelayCommand(_ => NewAsync());
        OpenCommand = new AsyncRelayCommand(async _ => await OpenAsync());
        SaveCommand = new AsyncRelayCommand(async _ => await SaveAsync(), _ => !string.IsNullOrEmpty(ProjectPath));
        SaveAsCommand = new AsyncRelayCommand(async _ => await SaveAsAsync());
        CloseProjectCommand = new AsyncRelayCommand(_ => CloseProjectAsync(), _ => !string.IsNullOrEmpty(ProjectPath));
        ExitCommand = new RelayCommand(_ =>
        {
            if (Application.Current?.ApplicationLifetime is IClassicDesktopStyleApplicationLifetime lifetime)
                lifetime.Shutdown();
        });

        UndoCommand = new RelayCommand(_ => StatusMessage = "撤销（待实现）");
        RedoCommand = new RelayCommand(_ => StatusMessage = "重做（待实现）");
        FindCommand = new RelayCommand(_ => StatusMessage = "查找（待实现）");
        ReplaceCommand = new RelayCommand(_ => StatusMessage = "替换（待实现）");

        ShowProjectInfoCommand = new RelayCommand(_ => OpenTab(new ProjectInfoViewModel()));
        ShowRateTemplateCommand = new RelayCommand(_ => StatusMessage = "取费模板（待实现）");
        RecomputeCommand = new RelayCommand(_ => Recompute());
        ShowTable3ACommand = new RelayCommand(_ => OpenTab(new Table3AViewModel()));
        ShowTable3BCommand = new RelayCommand(_ => OpenTab(new Table3BViewModel()));
        ShowTable3CCommand = new RelayCommand(_ => OpenTab(new Table3CViewModel()));
        ShowTable4ACommand = new RelayCommand(_ => OpenTab(new Table4AViewModel()));
        ShowTable4BCommand = new RelayCommand(_ => OpenTab(new Table4BViewModel()));
        ShowTable2Command = new RelayCommand(_ => OpenTab(new Table2ViewModel()));
        ShowTable1Command = new RelayCommand(_ => OpenTab(new Table1ViewModel()));
        ShowTable5Command = new RelayCommand(_ => OpenTab(new Table5ViewModel()));
        ShowSummaryCommand = new RelayCommand(_ => OpenTab(new SummaryViewModel()));
        ShowRatesCommand = new RelayCommand(_ => StatusMessage = "费率编辑（待实现）");
        ShowDiscountCommand = new RelayCommand(_ => StatusMessage = "打折规则（待实现）");
        ShowTable5ConfigCommand = new RelayCommand(_ => StatusMessage = "表五配置（待实现）");
        ShowAboutCommand = new AsyncRelayCommand(async _ => await ShowAboutAsync());
        CloseTabCommand = new RelayCommand(p => CloseTab(p as WorkbenchTabViewModel));
    }

    private Project? _currentProject;
    public Project? CurrentProject
    {
        get => _currentProject;
        set { _currentProject = value; OnPropertyChanged(); RaiseButtons(); }
    }

    private LibrarySet? _currentLibs;
    public LibrarySet? CurrentLibs
    {
        get => _currentLibs;
        set { _currentLibs = value; OnPropertyChanged(); AppLogger.Log($"CurrentLibs set: {value?.Quotas?.Count ?? 0} quotas"); }
    }

    private string? _projectPath;
    public string? ProjectPath
    {
        get => _projectPath;
        set { _projectPath = value; OnPropertyChanged(); OnPropertyChanged(nameof(ProjectPathDisplay)); RaiseButtons(); }
    }

    public string ProjectPathDisplay => string.IsNullOrEmpty(ProjectPath) ? "(未打开)" : ProjectPath!;

    private bool _isDirty;
    public bool IsDirty
    {
        get => _isDirty;
        set { _isDirty = value; OnPropertyChanged(); OnPropertyChanged(nameof(DirtyMarker)); }
    }

    public string DirtyMarker => IsDirty ? "已修改" : "已保存";

    private string _statusMessage = "就绪";
    public string StatusMessage
    {
        get => _statusMessage;
        set { _statusMessage = value; OnPropertyChanged(); }
    }

    private bool _isBusy;
    public bool IsBusy
    {
        get => _isBusy;
        set { _isBusy = value; OnPropertyChanged(); }
    }

    public bool ForceClose { get; set; }

    private NavItem? _selectedNav;
    public NavItem? SelectedNav
    {
        get => _selectedNav;
        set
        {
            _selectedNav = value;
            OnPropertyChanged();
            value?.Action?.Invoke();
        }
    }

    private WorkbenchTabViewModel? _selectedTab;
    public WorkbenchTabViewModel? SelectedTab
    {
        get => _selectedTab;
        set { _selectedTab = value; OnPropertyChanged(); }
    }

    public async Task NewAsync()
    {
        if (IsDirty && !await ConfirmDiscardChanges()) return;
        CurrentProject = new Project { Info = new ProjectInfo() };
        ProjectPath = null;
        IsDirty = false;
        OpenTabs.Clear();
        StatusMessage = "新建工程";
    }

    // 同步 New 保留供启动流程 / 测试使用（IsDirty=false 时直接跳过确认弹窗）
    public void New()
    {
        if (IsDirty) return; // 同步路径下无法弹异步对话框，启动/测试场景使用
        CurrentProject = new Project { Info = new ProjectInfo() };
        ProjectPath = null;
        IsDirty = false;
        OpenTabs.Clear();
        StatusMessage = "新建工程";
    }

    public async Task OpenAsync()
    {
        var storage = GetStorageProvider();
        if (storage == null) return;

        var files = await storage.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = "打开工程文件",
            AllowMultiple = false,
            FileTypeFilter = new[]
            {
                new FilePickerFileType("宇翔工程") { Patterns = new[] { "*.tbpj" } },
                new FilePickerFileType("JSON") { Patterns = new[] { "*.json" } },
                new FilePickerFileType("所有文件") { Patterns = new[] { "*.*" } },
            }
        });

        if (files.Count == 0) return;
        var path = files[0].TryGetLocalPath();
        if (string.IsNullOrEmpty(path)) return;

        try
        {
            var proj = BudgetDatabaseIO.Load(path);
            if (proj == null)
            {
                StatusMessage = "打开失败：文件为空或格式错误";
                return;
            }
            CurrentProject = proj;
            ProjectPath = path;
            IsDirty = false;
            StatusMessage = $"已打开 {path}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"打开失败：{ex.Message}";
        }
    }

    public async Task SaveAsync()
    {
        if (string.IsNullOrEmpty(ProjectPath))
        {
            await SaveAsAsync();
            return;
        }
        SaveCore(ProjectPath);
    }

    public async Task SaveAsAsync()
    {
        var storage = GetStorageProvider();
        if (storage == null) return;

        var file = await storage.SaveFilePickerAsync(new FilePickerSaveOptions
        {
            Title = "另存为",
            DefaultExtension = "tbpj",
            FileTypeChoices = new[]
            {
                new FilePickerFileType("宇翔工程") { Patterns = new[] { "*.tbpj" } },
                new FilePickerFileType("JSON") { Patterns = new[] { "*.json" } },
            }
        });

        if (file == null) return;
        var path = file.TryGetLocalPath();
        if (string.IsNullOrEmpty(path)) return;

        ProjectPath = path;
        SaveCore(path);
    }

    private void SaveCore(string path)
    {
        try
        {
            if (CurrentProject == null) return;
            BudgetDatabaseIO.Save(CurrentProject, path);
            IsDirty = false;
            StatusMessage = $"已保存 {path}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"保存失败：{ex.Message}";
        }
    }

    public async Task CloseProjectAsync()
    {
        if (IsDirty && !await ConfirmDiscardChanges()) return;
        CurrentProject = null;
        ProjectPath = null;
        IsDirty = false;
        OpenTabs.Clear();
        StatusMessage = "工程已关闭";
    }

    public void Recompute()
    {
        if (CurrentProject == null)
        {
            StatusMessage = "没有打开的工程";
            return;
        }
        RecomputeRequested?.Invoke(this, EventArgs.Empty);
        StatusMessage = "已触发重新计算";
    }

    public event EventHandler? RecomputeRequested;

    public void OpenTab(WorkbenchTabViewModel tab)
    {
        tab.Attach(this);
        var existing = OpenTabs.FirstOrDefault(t => t.Title == tab.Title);
        if (existing != null)
        {
            SelectedTab = existing;
            return;
        }
        OpenTabs.Add(tab);
        SelectedTab = tab;
    }

    public void CloseTab(WorkbenchTabViewModel? tab)
    {
        if (tab == null) return;
        OpenTabs.Remove(tab);
    }

    private async Task<bool> ConfirmDiscardChanges()
    {
        var window = GetMainWindow();
        if (window == null) return false;
        var box = MessageBoxManager.GetMessageBoxStandard(
            "确认", "当前工程已修改但未保存，确定放弃修改吗？",
            ButtonEnum.YesNo, Icon.Warning);
        var result = await box.ShowWindowDialogAsync(window);
        return result == ButtonResult.Yes;
    }

    public async Task ShowAboutAsync()
    {
        var window = GetMainWindow();
        if (window == null) return;
        var box = MessageBoxManager.GetMessageBoxStandard(
            "关于", "宇翔通信概预算软件 v4.0\nAvalonia 跨平台桌面版",
            ButtonEnum.Ok, Icon.Info);
        await box.ShowWindowDialogAsync(window);
    }

    public void MarkDirty() => IsDirty = true;

    private void RaiseButtons()
    {
        (SaveCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (CloseProjectCommand as RelayCommand)?.RaiseCanExecuteChanged();
        (SaveCommand as AsyncRelayCommand)?.RaiseCanExecuteChanged();
        (CloseProjectCommand as AsyncRelayCommand)?.RaiseCanExecuteChanged();
    }

    private IStorageProvider? GetStorageProvider()
    {
        var window = GetMainWindow();
        return window?.StorageProvider;
    }

    private Window? GetMainWindow()
    {
        if (Application.Current?.ApplicationLifetime is IClassicDesktopStyleApplicationLifetime lifetime)
            return lifetime.MainWindow;
        return null;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name ?? ""));
}

/// <summary>
/// 导航项：点击时触发对应动作。
/// </summary>
public class NavItem
{
    public string Title { get; }
    public Action? Action { get; }

    public NavItem(string title, Action? action)
    {
        Title = title;
        Action = action;
    }
}
