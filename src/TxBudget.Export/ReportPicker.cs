namespace TxBudget.Export;

/// <summary>
/// 报表选择器：维护用户选中的报表集合，支持预览标记。
/// </summary>
public class ReportPicker
{
    private readonly HashSet<string> _selectedKeys = new();

    /// <summary>
    /// 当前选中的报表 Key 列表。
    /// </summary>
    public IReadOnlyCollection<string> SelectedKeys => _selectedKeys;

    /// <summary>
    /// 当前预览中的报表 Key（单选）。
    /// </summary>
    public string? PreviewKey { get; set; }

    /// <summary>
    /// 切换某个报表的选中状态。
    /// </summary>
    public void Toggle(string key)
    {
        if (_selectedKeys.Contains(key))
            _selectedKeys.Remove(key);
        else
            _selectedKeys.Add(key);
    }

    /// <summary>
    /// 直接设置选中状态。
    /// </summary>
    public void SetSelected(string key, bool selected)
    {
        if (selected) _selectedKeys.Add(key);
        else _selectedKeys.Remove(key);
    }

    /// <summary>
    /// 全选。
    /// </summary>
    public void SelectAll() => _selectedKeys.UnionWith(ReportDefinitions.AllReports.Select(r => r.Key));

    /// <summary>
    /// 全不选。
    /// </summary>
    public void Clear() => _selectedKeys.Clear();

    /// <summary>
    /// 获取当前选中的报表定义列表。
    /// </summary>
    public List<ReportDefinitions.ReportDef> GetSelectedDefs() =>
        ReportDefinitions.AllReports.Where(r => _selectedKeys.Contains(r.Key)).ToList();

    /// <summary>
    /// 按类别获取选中项。
    /// </summary>
    public Dictionary<string, List<ReportDefinitions.ReportDef>> GetSelectedByCategory() =>
        GetSelectedDefs().GroupBy(r => r.Category).ToDictionary(g => g.Key, g => g.ToList());
}
