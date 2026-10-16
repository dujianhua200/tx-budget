using System.Windows;
using TxBudget.App.ViewModels;

namespace TxBudget.App;

public partial class MainWindow : Window
{
    private readonly MainWindowViewModel _vm = new();

    public MainWindow()
    {
        InitializeComponent();
        DataContext = _vm;
    }
}