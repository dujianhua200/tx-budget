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
}
