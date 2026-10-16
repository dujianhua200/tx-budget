using System;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using MsBox.Avalonia;
using MsBox.Avalonia.Enums;
using TxBudget.App.Infrastructure;
using TxBudget.App.ViewModels;

namespace TxBudget.App;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            BackupService.EnsureBackupDirectory();

            var mainWindow = new MainWindow();
            var vm = new MainWindowViewModel();
            mainWindow.DataContext = vm;

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
}
