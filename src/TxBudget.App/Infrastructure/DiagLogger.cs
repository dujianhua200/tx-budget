using System;
using System.Diagnostics;
using System.IO;

namespace TxBudget.App.Infrastructure;

/// <summary>
/// 诊断日志：独立于 app.log，记录输入事件、命令执行、界面自检与 Avalonia 绑定告警。
/// </summary>
public static class DiagLogger
{
    private static readonly object Gate = new();
    private static string Path =>
        System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "Library", "Application Support", "TxBudget", "logs", "diag.log");

    public static void Log(string message)
    {
        try
        {
            lock (Gate)
            {
                var dir = System.IO.Path.GetDirectoryName(Path);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                File.AppendAllText(Path, $"[{DateTime.Now:HH:mm:ss.fff}] {message}{Environment.NewLine}");
            }
        }
        catch { /* 诊断日志永不抛出 */ }
    }
}

/// <summary>
/// 把 Avalonia 内部日志（绑定失败等 Warning+）经 System.Diagnostics.Trace 转入 diag.log。
/// </summary>
public class DiagTraceListener : TraceListener
{
    public override void Write(string? message) { }
    public override void WriteLine(string? message)
    {
        if (!string.IsNullOrWhiteSpace(message))
            DiagLogger.Log("[avalonia] " + message);
    }
}
