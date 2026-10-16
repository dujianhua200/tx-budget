using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using Microsoft.Win32;
using TxBudget.App.Infrastructure;
using TxBudget.App.Workbench.ViewModels;
using TxBudget.Core.Model;

namespace TxBudget.App.ViewModels;

/// <summary>
/// 主窗口 ViewModel：菜单 / 工具栏命令 + 工程管理 + 自动备份协调。
/// </summary>
public class MainWindowViewModel : INotifyPropertyChanged
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

        NewCommand = new RelayCommand(_ => New());
        OpenCommand = new RelayCommand(_ => Open());
        SaveCommand = new RelayCommand(_ => Save(), _ => !string.IsNullOrEmpty(ProjectPath));
        SaveAsCommand = new RelayCommand(_ => SaveAs());
        CloseProjectCommand = new RelayCommand(_ => CloseProject(), _ => !string.IsNullOrEmpty(ProjectPath));
        ExitCommand = new RelayCommand(_ => System.Windows.Application.Current.Shutdown());

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
        ShowAboutCommand = new RelayCommand(_ =>
            System.Windows.MessageBox.Show("宇翔通信概预算软件 v4.0\n.NET 8 WPF 原生桌面版",
                "关于", MessageBoxButton.OK, MessageBoxImage.Information));
        CloseTabCommand = new RelayCommand(p => CloseTab(p as WorkbenchTabViewModel));
    }

    private Project? _currentProject;
    public Project? CurrentProject
    {
        get => _currentProject;
        set { _currentProject = value; OnPropertyChanged(); RaiseButtons(); }
    }

    private LibrarySet? _currentLibs;
    /// <summary>
    /// 当前可用定额库 / 标准库 / 材料价格 / 机械台班 数据集。
    /// 单工程工作台各页签通过 Host.CurrentLibs 取得，用于驱动计算引擎。
    /// 加载时机：构造完成后或由工程文件携带的依赖项驱动加载；
    /// 当前阶段由 Batch 模块的另一位同事负责标准库维护，本模块仅提供注入入口。
    /// </summary>
    public LibrarySet? CurrentLibs
    {
        get => _currentLibs;
        set { _currentLibs = value; OnPropertyChanged(); }
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

    public void New()
    {
        if (IsDirty && !ConfirmDiscardChanges()) return;
        CurrentProject = new Project { Info = new ProjectInfo() };
        ProjectPath = null;
        IsDirty = false;
        OpenTabs.Clear();
        StatusMessage = "新建工程";
    }

    public void Open()
    {
        var dlg = new OpenFileDialog
        {
            Title = "打开工程文件",
            Filter = "宇翔工程 (*.tbpj)|*.tbpj|JSON (*.json)|*.json|所有文件|*.*",
        };
        if (dlg.ShowDialog() != true) return;
        try
        {
            var proj = BudgetDatabaseIO.Load(dlg.FileName);
            if (proj == null)
            {
                StatusMessage = "打开失败：文件为空或格式错误";
                return;
            }
            CurrentProject = proj;
            ProjectPath = dlg.FileName;
            IsDirty = false;
            StatusMessage = $"已打开 {dlg.FileName}";
        }
        catch (System.Exception ex)
        {
            StatusMessage = $"打开失败：{ex.Message}";
        }
    }

    public void Save()
    {
        if (string.IsNullOrEmpty(ProjectPath))
        {
            SaveAs();
            return;
        }
        SaveCore(ProjectPath);
    }

    public void SaveAs()
    {
        var dlg = new SaveFileDialog
        {
            Title = "另存为",
            Filter = "宇翔工程 (*.tbpj)|*.tbpj|JSON (*.json)|*.json",
            DefaultExt = ".tbpj",
        };
        if (dlg.ShowDialog() != true) return;
        ProjectPath = dlg.FileName;
        SaveCore(ProjectPath);
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
        catch (System.Exception ex)
        {
            StatusMessage = $"保存失败：{ex.Message}";
        }
    }

    public void CloseProject()
    {
        if (IsDirty && !ConfirmDiscardChanges()) return;
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
        // 工作台各 ViewModel 通过订阅 RecomputeRequested 自行刷新
        RecomputeRequested?.Invoke(this, System.EventArgs.Empty);
        StatusMessage = "已触发重新计算";
    }

    public event System.EventHandler? RecomputeRequested;

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

    private bool ConfirmDiscardChanges()
    {
        var r = System.Windows.MessageBox.Show("当前工程已修改但未保存，确定放弃修改吗？",
            "确认", MessageBoxButton.YesNo, MessageBoxImage.Warning);
        return r == MessageBoxResult.Yes;
    }

    public void MarkDirty() => IsDirty = true;

    private void RaiseButtons()
    {
        (SaveCommand as RelayCommand)?.CanExecuteChanged?.Invoke(this, System.EventArgs.Empty);
        (CloseProjectCommand as RelayCommand)?.CanExecuteChanged?.Invoke(this, System.EventArgs.Empty);
    }

    public event System.ComponentModel.PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([System.Runtime.CompilerServices.CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new System.ComponentModel.PropertyChangedEventArgs(name ?? ""));
}

/// <summary>
/// 导航项：点击时触发对应动作。
/// </summary>
public class NavItem
{
    public string Title { get; }
    public System.Action? Action { get; }

    public NavItem(string title, System.Action? action)
    {
        Title = title;
        Action = action;
    }
}