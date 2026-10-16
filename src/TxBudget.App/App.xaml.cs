using System.Windows;
using TxBudget.App.Infrastructure;

namespace TxBudget.App;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        // 注册全局异常处理 + 自动备份目录
        BackupService.EnsureBackupDirectory();
        DispatcherUnhandledException += (s, args) =>
        {
            MessageBox.Show(args.Exception.Message, "未处理异常", MessageBoxButton.OK, MessageBoxImage.Error);
            args.Handled = true;
        };
    }
}