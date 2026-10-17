using System;
using System.IO;
using System.Runtime.InteropServices;

namespace TxBudget.App.Infrastructure;

/// <summary>
/// 应用日志：写入本地文件，便于排查运行时问题。
/// </summary>
public static class AppLogger
{
    private static string LogPath
    {
        get
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "Library", "Application Support", "TxBudget", "logs", "app.log");
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "TxBudget", "logs", "app.log");
            }
            else
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    ".local", "share", "TxBudget", "logs", "app.log");
            }
        }
    }

    public static void EnsureDirectory()
    {
        try
        {
            var dir = Path.GetDirectoryName(LogPath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                Directory.CreateDirectory(dir);
        }
        catch { /* ignore */ }
    }

    public static void Log(string message)
    {
        try
        {
            EnsureDirectory();
            var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}";
            File.AppendAllText(LogPath, line + Environment.NewLine);
        }
        catch { /* ignore */ }
    }

    public static void LogException(Exception ex)
    {
        Log($"[ERROR] {ex.GetType().Name}: {ex.Message}");
        if (ex.StackTrace != null)
            Log(ex.StackTrace);
        if (ex.InnerException != null)
        {
            Log($"[INNER] {ex.InnerException.GetType().Name}: {ex.InnerException.Message}");
        }
    }
}
