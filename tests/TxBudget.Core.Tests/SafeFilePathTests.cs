using TxBudget.Core.Infrastructure;
using Xunit;

namespace TxBudget.Core.Tests;

public class SafeFilePathTests
{
    [Fact]
    public void ValidateForWrite_EmptyPath_Throws()
    {
        Assert.Throws<ArgumentException>(() => SafeFilePath.ValidateForWrite(""));
    }

    [Fact]
    public void ValidateForWrite_PathTraversal_Throws()
    {
        Assert.Throws<ArgumentException>(() => SafeFilePath.ValidateForWrite("../escape.xlsx"));
        Assert.Throws<ArgumentException>(() => SafeFilePath.ValidateForWrite("foo/../../escape.xlsx"));
    }

    [Fact]
    public void ValidateForWrite_SensitiveDir_Throws()
    {
        if (OperatingSystem.IsWindows())
        {
            Assert.Throws<ArgumentException>(() => SafeFilePath.ValidateForWrite("C:\\Windows\\test.xlsx"));
        }
        else
        {
            Assert.Throws<ArgumentException>(() => SafeFilePath.ValidateForWrite("/etc/test.xlsx"));
        }
    }

    [Fact]
    public void ValidateForWrite_WrongExtension_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            SafeFilePath.ValidateForWrite("test.txt", allowedExtensions: new[] { ".xlsx" }));
    }

    [Fact]
    public void ValidateForWrite_ValidPath_Passes()
    {
        var ex = Record.Exception(() =>
            SafeFilePath.ValidateForWrite("test.xlsx", allowedExtensions: new[] { ".xlsx" }));
        Assert.Null(ex);
    }

    [Fact]
    public void ValidateForRead_NullPath_Throws()
    {
        Assert.Throws<ArgumentException>(() => SafeFilePath.ValidateForRead(""));
    }

    [Fact]
    public void ValidateForRead_ValidPath_Passes()
    {
        var ex = Record.Exception(() =>
            SafeFilePath.ValidateForRead("test.xlsx", allowedExtensions: new[] { ".xlsx" }));
        Assert.Null(ex);
    }

    [Fact]
    public void EnsureDirectory_CreatesMissingDir()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var filePath = Path.Combine(tempDir, "sub", "test.xlsx");
        try
        {
            SafeFilePath.EnsureDirectory(filePath);
            Assert.True(Directory.Exists(Path.Combine(tempDir, "sub")));
        }
        finally
        {
            if (Directory.Exists(tempDir))
                Directory.Delete(tempDir, true);
        }
    }
}
