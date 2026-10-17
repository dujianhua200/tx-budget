using System;
using System.Threading.Tasks;
using TxBudget.App.Workbench.Infrastructure;
using Xunit;

namespace TxBudget.App.Tests;

public class AsyncRelayCommandTests
{
    [Fact]
    public async Task AsyncRelayCommand_ExecutesAsync_WithoutBlocking()
    {
        var doneTcs = new TaskCompletionSource();
        var cmd = new AsyncRelayCommand(async _ =>
        {
            await Task.Yield();
        });

        // finally 中 RaiseCanExecuteChanged 在 _isExecuting=false 之后触发：
        // 仅当 CanExecute 恢复 true 时完成等待 → 确定性（首次触发处于执行中，被忽略）
        cmd.CanExecuteChanged += (_, _) =>
        {
            if (cmd.CanExecute(null)) doneTcs.TrySetResult();
        };

        cmd.Execute(null);

        // Execute 同步段内即置 _isExecuting：调用线程不被阻塞
        Assert.False(cmd.CanExecute(null), "执行中 CanExecute 应为 false");

        await doneTcs.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.True(cmd.CanExecute(null), "异步执行完成后 CanExecute 应恢复 true");
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
