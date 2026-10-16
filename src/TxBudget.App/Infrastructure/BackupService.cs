using System;
using System.IO;
using System.Text.Json;
using TxBudget.Core.Model;

namespace TxBudget.App.Infrastructure;

/// <summary>
/// 自动备份服务：保存时滚动生成 .bak 文件，最多保留 5 份。
/// </summary>
public static class BackupService
{
    private const int MaxBackups = 5;

    public static string BackupDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "TxBudget", "Backups");

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
        if (string.IsNullOrEmpty(projectFilePath) || !File.Exists(projectFilePath)) return;
        EnsureBackupDirectory();
        var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
        var backupPath = Path.Combine(BackupDirectory, $"{Path.GetFileName(projectFilePath)}.{stamp}.bak");
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
}

/// <summary>
/// 工程文件 IO：使用 JSON 持久化（与 data/seed.json 结构兼容）。
/// </summary>
public static class BudgetDatabaseIO
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNameHandling = JsonPropertyNameHandling.SimplifyChineseNames,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    public static Project? Load(string path)
    {
        if (!File.Exists(path)) return null;
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<Project>(json, Options);
    }

    public static void Save(Project project, string path)
    {
        var json = JsonSerializer.Serialize(project, Options);
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
        File.WriteAllText(path, json);
    }
}

/// <summary>
/// Json 简化的属性名策略：与种子文件保持中文字段一致。
/// </summary>
public static class JsonPropertyNameHandling
{
    public const string SimplifyChineseNames = "Chinese";
}