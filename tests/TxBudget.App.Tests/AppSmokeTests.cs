using Avalonia.Controls;
using Avalonia.Controls.Templates;
using Avalonia.Headless.XUnit;
using TxBudget.App.ViewModels;
using TxBudget.App.Workbench.ViewModels;
using Xunit;

namespace TxBudget.App.Tests;

/// <summary>
/// UI 冒烟测试：验证 Avalonia DataTemplate 已注册、Tab 可打开、内容不为空。
/// </summary>
public class AppSmokeTests
{
    [AvaloniaFact]
    public void Application_HasDataTemplates()
    {
        var app = Avalonia.Application.Current;
        Assert.NotNull(app);
        Assert.True(app.DataTemplates.Count > 0, "Application.DataTemplates 不应为空");
    }

    [AvaloniaFact]
    public void MainWindow_Opens_WithDefaultProject()
    {
        var window = new MainWindow();
        var vm = new MainWindowViewModel();
        vm.New();
        window.DataContext = vm;

        Assert.NotNull(window);
        Assert.NotNull(vm.CurrentProject);
    }

    [AvaloniaFact]
    public void TabControl_CanOpenProjectInfoTab()
    {
        var window = new MainWindow();
        var vm = new MainWindowViewModel();
        vm.New();
        window.DataContext = vm;

        vm.OpenTab(new ProjectInfoViewModel());
        Assert.Single(vm.OpenTabs);
        Assert.IsType<ProjectInfoViewModel>(vm.SelectedTab);
    }

    [AvaloniaFact]
    public void TabControl_CanOpenTable3ATab()
    {
        var window = new MainWindow();
        var vm = new MainWindowViewModel();
        vm.New();
        window.DataContext = vm;

        vm.OpenTab(new Table3AViewModel());
        Assert.Single(vm.OpenTabs);
        Assert.IsType<Table3AViewModel>(vm.SelectedTab);
    }

    [AvaloniaFact]
    public void DataTemplate_ExistsForProjectInfoViewModel()
    {
        var app = Avalonia.Application.Current;
        Assert.NotNull(app);
        var template = app.DataTemplates.FirstOrDefault(dt =>
            dt is IDataTemplate dataTemplate &&
            dataTemplate.Match(new ProjectInfoViewModel()));
        Assert.NotNull(template);
    }

    [AvaloniaFact]
    public void DataTemplate_ExistsForTable3AViewModel()
    {
        var app = Avalonia.Application.Current;
        Assert.NotNull(app);
        var template = app.DataTemplates.FirstOrDefault(dt =>
            dt is IDataTemplate dataTemplate &&
            dataTemplate.Match(new Table3AViewModel()));
        Assert.NotNull(template);
    }

    /// <summary>
    /// 全面检查所有 10 个 Workbench ViewModel 都已注册 DataTemplate。
    /// 这是一个回归测试——任何一个 ViewModel 漏注册都会让 Tab 内容只显示类型名。
    /// </summary>
    [AvaloniaFact]
    public void DataTemplate_Registered_ForAllWorkbenchViewModels()
    {
        var app = Avalonia.Application.Current;
        Assert.NotNull(app);

        var viewModels = new object[]
        {
            new ProjectInfoViewModel(),
            new Table3AViewModel(),
            new Table3BViewModel(),
            new Table3CViewModel(),
            new Table4AViewModel(),
            new Table4BViewModel(),
            new Table2ViewModel(),
            new Table1ViewModel(),
            new Table5ViewModel(),
            new SummaryViewModel(),
        };

        foreach (var vm in viewModels)
        {
            var template = app.DataTemplates.FirstOrDefault(dt =>
                dt is IDataTemplate dataTemplate &&
                dataTemplate.Match(vm));
            Assert.True(template != null, $"{vm.GetType().Name} 缺少 DataTemplate 注册");
        }
    }
}
