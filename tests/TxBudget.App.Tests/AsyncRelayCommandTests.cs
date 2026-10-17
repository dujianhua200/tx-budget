using System.Threading.Tasks;
using TxBudget.App.Workbench.Infrastructure;
using Xunit;

namespace TxBudget.App.Tests;

public class AsyncRelayCommandTests
{
    [Fact]
    public async Task AsyncRelayCommand_ExecutesAsync_WithoutBlocking()
    {
        var executed = false;
        var cmd = new AsyncRelayCommand(async _ =>
        {
            await Task.Delay(10);
            executed = true;
        });

        cmd.Execute(null);

        // 等待异步执行完成
        await Task.Delay(50);
        Assert.True(executed, "AsyncRelayCommand 必须真正执行异步逻辑");
    }

    [Fact]
    public void AsyncRelayCommand_IsNotExecuting_AfterCompletion()
    {
        var cmd = new AsyncRelayCommand(async _ => await Task.CompletedTask);
        cmd.Execute(null);
        Assert.True(cmd.CanExecute(null), "执行完成后 CanExecute 应为 true");
    }

    [Fact]
    public void AsyncRelayCommand_CanExecute_ReflectsPredicate()
    {
        var allow = false;
        var cmd = new AsyncRelayCommand(async _ => await Task.CompletedTask, _ => allow);
        Assert.False(cmd.CanExecute(null));
        allow = true;
        Assert.True(cmd.CanExecute(null));
    }

    [Fact]
    public void AsyncRelayCommand_PreventsReentry()
    {
        var entered = false;
        var reentered = false;
        var cmd = new AsyncRelayCommand(async _ =>
        {
            if (entered) reentered = true;
            entered = true;
            await Task.Delay(30);
            entered = false;
        });

        cmd.Execute(null);
        cmd.Execute(null); // 在第一次未完成时再次调用

        Assert.False(reentered, "执行未完成时再次执行应被 CanExecute 阻止");
    }
}
