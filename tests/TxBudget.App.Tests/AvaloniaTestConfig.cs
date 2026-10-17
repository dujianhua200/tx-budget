using Avalonia;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using TxBudget.App;

[assembly: AvaloniaTestApplication(typeof(TestAppBuilder))]

public class TestAppBuilder
{
    public static AppBuilder BuildAvaloniaApp()
        => Program.BuildAvaloniaApp()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions());
}
