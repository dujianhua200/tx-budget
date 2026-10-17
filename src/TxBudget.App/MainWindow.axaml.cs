using System;
using System.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using Avalonia.VisualTree;
using TxBudget.App.Infrastructure;
using TxBudget.App.ViewModels;

namespace TxBudget.App;

public partial class MainWindow : Window
{
    private int _moveLogCount;

    public MainWindow()
    {
        InitializeComponent();

        // 诊断：隧道方式记录指针事件与按钮命令状态，定位"点击无反应"的环节
        AddHandler(InputElement.PointerMovedEvent, OnDiagPointerMoved, RoutingStrategies.Tunnel, handledEventsToo: true);
        AddHandler(InputElement.PointerPressedEvent, OnDiagPointerPressed, RoutingStrategies.Tunnel, handledEventsToo: true);
        AddHandler(InputElement.PointerReleasedEvent, OnDiagPointerReleased, RoutingStrategies.Tunnel, handledEventsToo: true);
        AddHandler(Button.ClickEvent, OnDiagClick, RoutingStrategies.Tunnel, handledEventsToo: true);
    }

    private void OnDiagPointerMoved(object? sender, PointerEventArgs e)
    {
        if (_moveLogCount >= 200) return;
        _moveLogCount++;
        DiagLogger.Log($"POINTER Move @ {Fmt(e)} -> {Describe(e.Source)}");
    }

    private void OnDiagPointerPressed(object? sender, PointerEventArgs e) =>
        DiagLogger.Log($"POINTER Pressed @ {Fmt(e)} -> {Describe(e.Source)}");

    private void OnDiagPointerReleased(object? sender, PointerEventArgs e) =>
        DiagLogger.Log($"POINTER Released @ {Fmt(e)} -> {Describe(e.Source)}");

    private void OnDiagClick(object? sender, RoutedEventArgs e) =>
        DiagLogger.Log($"CLICK event -> {Describe(e.Source)}");

    private string Fmt(PointerEventArgs e)
    {
        var p = e.GetCurrentPoint(this).Position;
        return $"{p.X:F0},{p.Y:F0}";
    }

    private static string Describe(object? source)
    {
        if (source is not Visual visual)
            return source?.GetType().Name ?? "null";

        foreach (var node in visual.GetSelfAndVisualAncestors())
        {
            if (node is Button b)
            {
                var cmd = b.Command;
                var canExec = cmd?.CanExecute(null);
                return $"Button[{LabelOf(b)}] cmd={(cmd == null ? "NULL" : cmd.GetType().Name)} canExec={(canExec?.ToString() ?? "?")}";
            }
        }
        return visual.GetType().Name;
    }

    private static string LabelOf(Button b) => b.Content switch
    {
        TextBlock tb => tb.Text ?? "?",
        string s => s,
        _ => b.Content?.ToString() ?? "?"
    };

    /// <summary>
    /// 启动自检：统计按钮命令绑定，执行一次"打开表三甲页签"全链路验证，结果写横幅与日志。
    /// </summary>
    public void RunStartupSelfTest(MainWindowViewModel vm)
    {
        Dispatcher.UIThread.Post(() =>
        {
            try
            {
                var buttons = this.GetVisualDescendants().OfType<Button>().ToList();
                var broken = buttons.Where(b => b.Command == null).Select(LabelOf).ToList();
                var disabled = buttons.Where(b => b.Command != null && !b.Command.CanExecute(null)).Select(LabelOf).ToList();
                DiagLogger.Log($"SELFTEST: buttons={buttons.Count} 无命令=[{string.Join(",", broken)}] 已禁用=[{string.Join(",", disabled)}]");

                var before = vm.OpenTabs.Count;
                vm.ShowTable3ACommand.Execute(null);
                Dispatcher.UIThread.RunJobs();
                var after = vm.OpenTabs.Count;
                var contentOk = this.GetVisualDescendants().OfType<TabControl>()
                    .Any(t => t.SelectedContent != null);
                DiagLogger.Log($"SELFTEST: 页签 {before}->{after} contentOk={contentOk}");

                if (after > before && contentOk)
                {
                    vm.DiagBanner = $"自检通过：{buttons.Count} 个按钮命令已绑定，页签打开正常。若某按钮仍无反应，请点击它一次后关闭软件，把日志发给开发者。";
                    DiagLogger.Log("SELFTEST: PASS");
                }
                else
                {
                    vm.DiagBanner = "自检异常：按钮或页签未通过，请把日志发给开发者。";
                    DiagLogger.Log("SELFTEST: FAIL");
                }

                var tab = vm.OpenTabs.FirstOrDefault(t => t.Title?.Contains("表三甲") == true);
                if (tab != null) vm.CloseTab(tab);
            }
            catch (Exception ex)
            {
                DiagLogger.Log("SELFTEST EXC: " + ex);
                vm.DiagBanner = "自检出错：" + ex.Message;
            }
        }, DispatcherPriority.Loaded);
    }
}
