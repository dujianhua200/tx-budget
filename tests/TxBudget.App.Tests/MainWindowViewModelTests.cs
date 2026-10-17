using TxBudget.App.ViewModels;
using TxBudget.App.Workbench.ViewModels;
using Xunit;

namespace TxBudget.App.Tests;

public class MainWindowViewModelTests
{
    [Fact]
    public void New_CreatesProject()
    {
        var vm = new MainWindowViewModel();
        vm.New();
        Assert.NotNull(vm.CurrentProject);
        Assert.NotNull(vm.CurrentProject.Info);
    }

    [Fact]
    public void OpenTab_AddsTab()
    {
        var vm = new MainWindowViewModel();
        vm.New();
        vm.OpenTab(new ProjectInfoViewModel());
        Assert.Single(vm.OpenTabs);
        Assert.NotNull(vm.SelectedTab);
        Assert.Equal("工程信息", vm.SelectedTab.Title);
    }

    [Fact]
    public void OpenTab_SameTitle_Dedupes()
    {
        var vm = new MainWindowViewModel();
        vm.New();
        vm.OpenTab(new ProjectInfoViewModel());
        vm.OpenTab(new ProjectInfoViewModel());
        Assert.Single(vm.OpenTabs);
    }

    [Fact]
    public void Navigation_HasItems()
    {
        var vm = new MainWindowViewModel();
        Assert.True(vm.Navigation.Count > 0, "导航列表不应为空");
    }

    [Fact]
    public void NewAsync_ClearsTabsAndCreatesProject()
    {
        var vm = new MainWindowViewModel();
        vm.OpenTab(new TxBudget.App.Workbench.ViewModels.ProjectInfoViewModel());
        Assert.Single(vm.OpenTabs);

        // 同步 New() 在 IsDirty=false 时直接执行不弹窗
        vm.New();
        Assert.NotNull(vm.CurrentProject);
        Assert.Empty(vm.OpenTabs);
    }

    [Fact]
    public void SaveCommand_IsDisabled_WhenNoProjectPath()
    {
        var vm = new MainWindowViewModel();
        Assert.False(vm.SaveCommand.CanExecute(null), "没有 ProjectPath 时 SaveCommand 应禁用");
    }

    [Fact]
    public void CloseProjectCommand_IsDisabled_WhenNoProjectPath()
    {
        var vm = new MainWindowViewModel();
        Assert.False(vm.CloseProjectCommand.CanExecute(null), "没有 ProjectPath 时 CloseProjectCommand 应禁用");
    }
}
