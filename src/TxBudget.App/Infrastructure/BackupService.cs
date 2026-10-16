using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using TxBudget.Core.Infrastructure;
using TxBudget.Core.Model;

namespace TxBudget.App.Infrastructure;

/// <summary>
/// 自动备份服务：保存时滚动生成 .bak 文件，最多保留 5 份。
/// </summary>
public static class BackupService
{
    private const int MaxBackups = 5;

    public static string BackupDirectory
    {
        get
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "Library", "Application Support", "TxBudget", "backup");
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "TxBudget", "backup");
            }
            else // Linux and others
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    ".local", "share", "TxBudget", "backup");
            }
        }
    }

    public static void EnsureBackupDirectory()
    {
        if (!Directory.Exists(BackupDirectory))
        {
            Directory.CreateDirectory(BackupDirectory);
        }
    }

    /// <summary>
    /// 把当前工程文件复制成 .bak 滚动备份。
    /// </summary>
    public static void Backup(string projectFilePath)
    {
        try
        {
            if (string.IsNullOrEmpty(projectFilePath) || !File.Exists(projectFilePath)) return;

            SafeFilePath.ValidateForRead(projectFilePath);
            EnsureBackupDirectory();
            var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var backupPath = Path.Combine(BackupDirectory, $"{Path.GetFileName(projectFilePath)}.{stamp}.bak");
            SafeFilePath.ValidateForWrite(backupPath);
            File.Copy(projectFilePath, backupPath, overwrite: true);

            // 只保留最近 5 份
            var dir = new DirectoryInfo(BackupDirectory);
            var sameBase = dir.GetFiles($"{Path.GetFileName(projectFilePath)}.*.bak");
            Array.Sort(sameBase, (a, b) => b.CreationTime.CompareTo(a.CreationTime));
            for (int i = MaxBackups; i < sameBase.Length; i++)
            {
                try { sameBase[i].Delete(); } catch { /* ignore */ }
            }
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"备份失败: {ex.Message}", ex);
        }
    }
}

/// <summary>
/// 工程文件 IO：使用 JSON 持久化（与 data/seed.json 结构兼容）。
/// </summary>
public static class BudgetDatabaseIO
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static Project? Load(string path)
    {
        SafeFilePath.ValidateForRead(path);
        if (!File.Exists(path)) return null;
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<Project>(json, Options);
    }

    public static void Save(Project project, string path)
    {
        SafeFilePath.ValidateForWrite(path);
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
        File.WriteAllText(path, JsonSerializer.Serialize(project, Options));
    }
}
