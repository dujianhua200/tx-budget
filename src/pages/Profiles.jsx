import { useState } from 'react';
import { createProfile, duplicateProfile } from '../lib/profiles.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

/**
 * 配置方案管理页（v2 增量 4）：列表 / 新建 / 复制 / 重命名 / 删除（占用检查）
 * / 导出方案文件 / 导入方案文件 / 设为新建默认 / 整库备份。
 * 导入/导出全部走主进程 fs 写真实路径（B1），不走浏览器下载。
 */
export default function Profiles({ db, updateDb, pushUndo, notify }) {
  const [newName, setNewName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirm, setConfirm] = useState(null); // { profile, impact, mode: 'delete' }
  const [switchTarget, setSwitchTarget] = useState('');

  const profiles = db.configurationProfiles || [];
  const activeId = db.settings?.activeProfileId;
  const projectsOf = (pid) => (db.projects || []).filter((p) => p.profileId === pid);

  const handleCreate = () => {
    const name = newName.trim() || '新配置方案';
    const template = templateId ? profiles.find((p) => p.id === templateId) : null;
    const created = template ? duplicateProfile(template) : createProfile(name);
    if (template) created.name = name;
    updateDb((d) => { d.configurationProfiles.push(created); });
    setNewName('');
    notify(`已新建配置方案“${created.name}”`, { undo: false });
  };

  const handleDuplicate = (p) => {
    const copy = duplicateProfile(p);
    updateDb((d) => { d.configurationProfiles.push(copy); });
    notify(`已复制为“${copy.name}”`, { undo: false });
  };

  const handleRename = (p) => {
    const name = renameValue.trim();
    if (!name) { setRenameId(null); return; }
    updateDb((d) => {
      const t = d.configurationProfiles.find((x) => x.id === p.id);
      if (t) { t.name = name; t.updatedAt = new Date().toISOString(); }
    });
    setRenameId(null);
    notify(`已重命名为“${name}”`, { undo: false });
  };

  const askDelete = (p) => {
    const using = projectsOf(p.id);
    if (profiles.length <= 1) {
      alert('至少保留一个配置方案，无法删除最后一个方案。');
      return;
    }
    if (using.length) {
      setConfirm({
        profile: p,
        mode: 'blocked',
        impact: `仍有 ${using.length} 个工程使用该方案，无法直接删除。\n工程：${using.map((x) => x.name).join('、')}\n请先将这些工程切换到其他方案，再删除。`,
      });
      setSwitchTarget(profiles.find((x) => x.id !== p.id)?.id || '');
      return;
    }
    setConfirm({
      profile: p,
      mode: 'delete',
      impact: `将删除配置方案“${p.name}”（含其全部库、费率、规则），该方案无工程引用。删除前已备份，可撤销。`,
    });
  };

  const doDelete = (p) => {
    pushUndo(
      { scope: 'profiles', profilesBefore: JSON.parse(JSON.stringify(profiles)), settingsBefore: JSON.parse(JSON.stringify(db.settings || {})) },
      `删除配置方案“${p.name}”`,
    );
    updateDb((d) => {
      d.configurationProfiles = d.configurationProfiles.filter((x) => x.id !== p.id);
      if (d.settings?.activeProfileId === p.id) d.settings.activeProfileId = d.configurationProfiles[0]?.id;
    }, { major: true });
    setConfirm(null);
    notify(`已删除配置方案“${p.name}”，可撤销`, { undo: true });
  };

  const switchUsingProjects = (p) => {
    if (!switchTarget) return;
    updateDb((d) => {
      for (const proj of d.projects) {
        if (proj.profileId === p.id) proj.profileId = switchTarget;
      }
    });
    setConfirm(null);
    notify(`已将 ${projectsOf(p.id).length} 个工程切换到新方案，切换后请重新计算核对`, { undo: false });
  };

  const handleExport = async (p) => {
    const file = await window.api.saveFile({ defaultPath: `${p.name}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!file) return;
    const res = await window.api.exportProfile({ profileId: p.id, filePath: file });
    if (res?.ok) notify(`已导出：${res.filePath}`, { undo: false });
    else alert(`导出失败：${res?.error || '未知错误'}`);
  };

  const handleImport = async () => {
    const file = await window.api.openFile([{ name: 'JSON', extensions: ['json'] }]);
    if (!file) return;
    const res = await window.api.importProfile({ filePath: file });
    if (res?.ok) notify(`已导入配置方案“${res.profile.name}”`, { undo: false });
    else alert(`导入失败：${res?.error || '未知错误'}`);
  };

  const handleBackup = async () => {
    const file = await window.api.saveFile({ defaultPath: '概预算整库备份.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!file) return;
    const res = await window.api.exportBackup({ filePath: file });
    if (res?.ok) notify(`整库已备份：${res.filePath}`, { undo: false });
    else alert(`备份失败：${res?.error || '未知错误'}`);
  };

  return (
    <div>
      <h2>配置方案</h2>
      <p className="muted">每套方案拥有独立完整的一套库、费率、规则，不同方案之间数据完全隔离。导出/导入走主进程写真实路径，文件落在你选的路径。</p>
      <div className="toolbar">
        <input className="input" style={{ width: 220 }} placeholder="新方案名称" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <label>以…为模板 <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">（空白方案）</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <button className="btn primary" onClick={handleCreate}>＋ 新建方案</button>
        <button className="btn" onClick={handleImport}>导入方案文件</button>
        <button className="btn" onClick={handleBackup}>整库备份</button>
      </div>
      <table className="table"><thead><tr><th>方案名</th><th>来源</th><th>工程数</th><th>状态</th><th></th></tr></thead>
        <tbody>{profiles.map((p) => (
          <tr key={p.id}>
            <td>
              {renameId === p.id ? (
                <span><input className="input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
                  <button className="btn sm" onClick={() => handleRename(p)}>保存</button>
                  <button className="btn sm" onClick={() => setRenameId(null)}>取消</button></span>
              ) : (
                <span>{p.name} <button className="btn sm" onClick={() => { setRenameId(p.id); setRenameValue(p.name); }}>重命名</button></span>
              )}
            </td>
            <td>{p.source}</td>
            <td>{projectsOf(p.id).length}</td>
            <td>{activeId === p.id ? '新建默认' : ''}</td>
            <td>
              <button className="btn sm" disabled={activeId === p.id} onClick={() => updateDb((d) => { d.settings.activeProfileId = p.id; })}>设为新建默认</button>
              <button className="btn sm" onClick={() => handleDuplicate(p)}>复制</button>
              <button className="btn sm" onClick={() => handleExport(p)}>导出</button>
              <button className="btn sm danger" onClick={() => askDelete(p)}>删除</button>
            </td>
          </tr>
        ))}</tbody></table>
      <ConfirmDialog
        open={!!confirm && confirm.mode === 'delete'}
        title={`删除配置方案“${confirm?.profile?.name}”？`}
        impact={confirm?.impact}
        samples={[]}
        confirmLabel="确认删除"
        onCancel={() => setConfirm(null)}
        onConfirm={() => doDelete(confirm.profile)}
      />
      {confirm?.mode === 'blocked' && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>无法删除“{confirm.profile.name}”</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{confirm.impact}</p>
          <div className="row">
            <label>将这些工程切换到 <select className="input" value={switchTarget} onChange={(e) => setSwitchTarget(e.target.value)}>
              {profiles.filter((x) => x.id !== confirm.profile.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
            <button className="btn primary" onClick={() => switchUsingProjects(confirm.profile)}>切换工程</button>
            <button className="btn" onClick={() => setConfirm(null)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
