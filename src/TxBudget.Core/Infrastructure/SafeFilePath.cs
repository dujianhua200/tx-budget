namespace TxBudget.Core.Infrastructure;

/// <summary>
/// 文件路径安全校验工具：防止路径遍历注入、空路径、敏感目录写入。
/// </summary>
public static class SafeFilePath
{
    /// <summary>
    /// 系统敏感目录黑名单（禁止写入）。
    /// </summary>
    private static readonly HashSet<string> SensitiveDirs = new(StringComparer.OrdinalIgnoreCase)
    {
        "/", "/etc", "/bin", "/sbin", "/usr", "/lib", "/lib64", "/sys", "/proc", "/dev",
        "c:\\", "c:\\windows", "c:\\windows\\system32", "c:\\program files", "c:\\program files (x86)",
    };

    /// <summary>
    /// 校验文件路径是否安全，用于写入操作。
    /// 禁止：空路径、路径遍历(..)、绝对路径指向系统敏感目录。
    /// </summary>
    /// <param name="filePath">待校验路径</param>
    /// <param name="allowedBaseDir">可选：限定只能写入此目录及其子目录</param>
    /// <param name="allowedExtensions">可选：允许的扩展名白名单（如 .xlsx, .csv）</param>
    /// <exception cref="ArgumentException">路径不合法时抛出</exception>
    public static void ValidateForWrite(string filePath, string? allowedBaseDir = null, string[]? allowedExtensions = null)
    {
        if (string.IsNullOrWhiteSpace(filePath))
            throw new ArgumentException("文件路径不能为空。", nameof(filePath));

        // 阻止路径遍历
        if (filePath.Contains("..") || filePath.Contains("//") || filePath.Contains("\\\\"))
            throw new ArgumentException($"路径包含非法遍历字符: {filePath}", nameof(filePath));

        // 获取绝对路径
        string fullPath;
        try
        {
            fullPath = Path.GetFullPath(filePath);
        }
        catch (Exception ex)
        {
            throw new ArgumentException($"无法解析路径: {filePath}", nameof(filePath), ex);
        }

        // 检查敏感目录
        var parentDir = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(parentDir))
        {
            var lowerParent = parentDir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).ToLowerInvariant();
            foreach (var sensitive in SensitiveDirs)
            {
                if (lowerParent == sensitive || lowerParent.StartsWith(sensitive + Path.DirectorySeparatorChar))
                    throw new ArgumentException($"禁止写入系统敏感目录: {parentDir}", nameof(filePath));
            }
        }

        // 检查扩展名白名单
        if (allowedExtensions != null && allowedExtensions.Length > 0)
        {
            var ext = Path.GetExtension(filePath).ToLowerInvariant();
            if (!allowedExtensions.Contains(ext))
                throw new ArgumentException($"不允许的文件扩展名 '{ext}'，只允许: {string.Join(", ", allowedExtensions)}", nameof(filePath));
        }

        // 限定工作目录
        if (!string.IsNullOrEmpty(allowedBaseDir))
        {
            var baseFull = Path.GetFullPath(allowedBaseDir);
            if (!fullPath.StartsWith(baseFull, StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException($"路径必须位于工作目录内: {allowedBaseDir}", nameof(filePath));
        }
    }

    /// <summary>
    /// 校验文件路径是否安全，用于读取操作。
    /// </summary>
    public static void ValidateForRead(string filePath, string? allowedBaseDir = null, string[]? allowedExtensions = null)
    {
        if (string.IsNullOrWhiteSpace(filePath))
            throw new ArgumentException("文件路径不能为空。", nameof(filePath));

        if (filePath.Contains("..") || filePath.Contains("//") || filePath.Contains("\\\\"))
            throw new ArgumentException($"路径包含非法遍历字符: {filePath}", nameof(filePath));

        string fullPath;
        try
        {
            fullPath = Path.GetFullPath(filePath);
        }
        catch (Exception ex)
        {
            throw new ArgumentException($"无法解析路径: {filePath}", nameof(filePath), ex);
        }

        if (allowedExtensions != null && allowedExtensions.Length > 0)
        {
            var ext = Path.GetExtension(filePath).ToLowerInvariant();
            if (!allowedExtensions.Contains(ext))
                throw new ArgumentException($"不允许的文件扩展名 '{ext}'，只允许: {string.Join(", ", allowedExtensions)}", nameof(filePath));
        }

        if (!string.IsNullOrEmpty(allowedBaseDir))
        {
            var baseFull = Path.GetFullPath(allowedBaseDir);
            if (!fullPath.StartsWith(baseFull, StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException($"路径必须位于工作目录内: {allowedBaseDir}", nameof(filePath));
        }
    }

    /// <summary>
    /// 确保输出目录存在。
    /// </summary>
    public static void EnsureDirectory(string filePath)
    {
        var dir = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            Directory.CreateDirectory(dir);
    }
}
