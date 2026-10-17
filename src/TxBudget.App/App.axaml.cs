using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using MsBox.Avalonia;
using MsBox.Avalonia.Enums;
using TxBudget.App.Infrastructure;
using TxBudget.App.ViewModels;
using TxBudget.App.Workbench.ViewModels;
using TxBudget.Core.Infrastructure;

namespace TxBudget.App;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        // 诊断：Avalonia 绑定警告路由到 diag.log + 启动版本日志
        System.Diagnostics.Trace.Listeners.Add(new DiagTraceListener());
        DiagLogger.Log($"===== 启动 v{typeof(Program).Assembly.GetName().Version?.ToString(3)} =====");

        // 全局异常处理：任何未捕获异常写入日志文件
        AppDomain.CurrentDomain.UnhandledException += (s, e) =>
        {
            if (e.ExceptionObject is Exception ex)
            {
                AppLogger.LogException(ex);
            }
        };

        TaskScheduler.UnobservedTaskException += (s, e) =>
        {
            AppLogger.LogException(e.Exception);
            e.SetObserved();
        };

        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            try
            {
                BackupService.EnsureBackupDirectory();
            }
            catch (Exception ex)
            {
                AppLogger.LogException(ex);
            }

            var mainWindow = new MainWindow();
            var vm = new MainWindowViewModel();

            // 加载嵌入的默认定额库
            LoadEmbeddedSeed(vm);

            // 启动时自动创建空工程，避免界面全部空白
            vm.New();
            vm.OpenTab(new ProjectInfoViewModel());

            mainWindow.DataContext = vm;

            // 窗口显示后运行界面自检（按钮命令绑定 + 页签打开全链路）
            mainWindow.Opened += (s, e) => mainWindow.RunStartupSelfTest(vm);

            desktop.MainWindow = mainWindow;
            desktop.ShutdownMode = Avalonia.Controls.ShutdownMode.OnMainWindowClose;

            mainWindow.Closing += async (s, e) =>
            {
                if (vm.IsDirty && !vm.ForceClose)
                {
                    e.Cancel = true;
                    var box = MessageBoxManager.GetMessageBoxStandard(
                        "确认", "当前工程已修改但未保存，确定退出吗？",
                        ButtonEnum.YesNo, Icon.Warning);
                    var result = await box.ShowWindowDialogAsync(mainWindow);
                    if (result == ButtonResult.Yes)
                    {
                        vm.ForceClose = true;
                        mainWindow.Close();
                    }
                }
            };
        }

        base.OnFrameworkInitializationCompleted();
    }

    private static void LoadEmbeddedSeed(MainWindowViewModel vm)
    {
        try
        {
            var asm = Assembly.GetExecutingAssembly();
            var resourceName = asm.GetManifestResourceNames()
                .FirstOrDefault(n => n.EndsWith("seed.json", StringComparison.OrdinalIgnoreCase));
            if (resourceName == null)
            {
                AppLogger.Log("未找到嵌入的 seed.json 资源");
                return;
            }

            using var stream = asm.GetManifestResourceStream(resourceName);
            if (stream == null)
            {
                AppLogger.Log("无法打开 seed.json 资源流");
                return;
            }

            var libs = SeedLibraryLoader.LoadFromStream(stream);
            vm.CurrentLibs = libs;
            AppLogger.Log($"已加载默认定额库：{libs.Quotas?.Count ?? 0} 条定额");
        }
        catch (Exception ex)
        {
            AppLogger.LogException(ex);
        }
    }
}
