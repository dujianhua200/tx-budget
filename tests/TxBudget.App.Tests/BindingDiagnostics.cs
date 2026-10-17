using System;
using System.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.VisualTree;
using TxBudget.App.ViewModels;
using TxBudget.App.Workbench.ViewModels;
using Xunit;

namespace TxBudget.App.Tests;

/// <summary>
/// 诊断测试：走真实窗口 + 真实鼠标事件，验证"点击按钮 → 页签打开 → 内容模板解析"全链路。
/// </summary>
public class BindingDiagnostics
{
    private static MainWindow CreateShownWindow()
    {
        var window = new MainWindow();
        var vm = new MainWindowViewModel();
        vm.New();
        window.DataContext = vm;
        window.Show();
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        return window;
    }

    private static Button FindButtonByText(Window window, string text)
    {
        return window.GetVisualDescendants().OfType<Button>()
            .First(b => (b.Content as TextBlock)?.Text?.Contains(text) == true);
    }

    [AvaloniaFact]
    public void NavButton_CommandBound()
    {
        var window = CreateShownWindow();
        var btn = FindButtonByText(window, "工程信息");
        Assert.True(btn.Command != null, "导航按钮 Command 为 null → 绑定断裂");
        Assert.True(btn.IsEffectivelyEnabled, "导航按钮被禁用");
    }

    [AvaloniaFact]
    public void ClickNavButton_OpensTab()
    {
        var window = CreateShownWindow();
        var vm = (MainWindowViewModel)window.DataContext!;
        var btn = FindButtonByText(window, "工程信息");

        var origin = btn.TranslatePoint(new Point(btn.Bounds.Width / 2, btn.Bounds.Height / 2), window)
                     ?? throw new InvalidOperationException("无法计算按钮坐标");
        window.MouseDown(origin, MouseButton.Left);
        window.MouseUp(origin, MouseButton.Left);

        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.True(vm.OpenTabs.Count == 1, $"点击后应打开 1 个页签，实际 {vm.OpenTabs.Count}");
    }

    [AvaloniaFact]
    public void TabContent_TemplateResolves()
    {
        var window = CreateShownWindow();
        var vm = (MainWindowViewModel)window.DataContext!;
        vm.ShowTable3ACommand.Execute(null);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();

        var tab = window.GetVisualDescendants().OfType<TabControl>().Single();
        Assert.True(tab.ItemCount == 1, $"TabControl.ItemCount 应为 1，实际 {tab.ItemCount}（ItemsSource 绑定断裂）");
        Assert.NotNull(tab.SelectedItem);
        Assert.True(tab.SelectedContent != null, "SelectedContent 为 null → DataTemplate 未解析，页签内容空白");
    }

    [AvaloniaFact]
    public void StatusBar_ShowsStatusMessage()
    {
        var window = CreateShownWindow();
        var texts = window.GetVisualDescendants().OfType<TextBlock>()
            .Select(t => t.Text).Where(t => t != null).ToList();
        Assert.True(texts.Contains("新建工程"),
            "状态栏应显示 '新建工程'，实际可见文本: " + string.Join(" | ", texts!));
    }

    [AvaloniaFact]
    public void Table3A_InsertRowButton_Works()
    {
        var window = CreateShownWindow();
        var vm = (MainWindowViewModel)window.DataContext!;
        vm.ShowTable3ACommand.Execute(null);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();

        var insertBtn = window.GetVisualDescendants().OfType<Button>()
            .First(b => (b.Content as string) == "插入行");
        Assert.True(insertBtn.Command != null, "插入行按钮 Command 为 null → 绑定断裂");
        insertBtn.Command.Execute(null);

        var vm3a = (Table3AViewModel)vm.SelectedTab!;
        Assert.True(vm3a.Rows.Count == 1, $"插入行后应有 1 行，实际 {vm3a.Rows.Count}");
    }
}
