using System.Windows.Input;

namespace TxBudget.App.Infrastructure;

/// <summary>
/// 通用 RelayCommand 实现。
/// </summary>
public class RelayCommand : ICommand
{
    private readonly System.Action<object?> _execute;
    private readonly System.Predicate<object?>? _canExecute;

    public RelayCommand(System.Action<object?> execute, System.Predicate<object?>? canExecute = null)
    {
        _execute = execute ?? throw new System.ArgumentNullException(nameof(execute));
        _canExecute = canExecute;
    }

    public RelayCommand(System.Action execute, System.Func<bool>? canExecute = null)
        : this(_ => execute(), canExecute == null ? null : new System.Predicate<object?>(_ => canExecute()))
    {
    }

    public bool CanExecute(object? parameter) => _canExecute?.Invoke(parameter) ?? true;

    public void Execute(object? parameter) => _execute(parameter);

    public event System.EventHandler? CanExecuteChanged
    {
        add { CommandManager.RequerySuggested += value; }
        remove { CommandManager.RequerySuggested -= value; }
    }
}