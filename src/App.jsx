import { useEffect, useState } from 'react';
import Projects from './pages/Projects.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import Batch from './pages/Batch.jsx';
import Settings from './pages/Settings.jsx';
import './styles.css';

export default function App() {
  const [db, setDb] = useState(null);
  const [view, setView] = useState('projects');
  const [openId, setOpenId] = useState(null);

  useEffect(() => { window.api.getDb().then(setDb); }, []);

  if (!db) return <div style={{ padding: 40 }}>正在加载数据…</div>;

  const updateDb = (fn) => {
    setDb((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      fn(next);
      window.api.saveDb(next);
      return next;
    });
  };
  const openProject = (id) => { setOpenId(id); setView('detail'); };
  const project = openId ? db.projects.find((p) => p.id === openId) : null;

  return (
    <div className="app">
      <header className="header">
        <span className="logo">通信概预算</span>
        <nav>
          <button className={view === 'projects' || view === 'detail' ? 'nav active' : 'nav'} onClick={() => setView('projects')}>工程</button>
          <button className={view === 'batch' ? 'nav active' : 'nav'} onClick={() => setView('batch')}>批量生成</button>
          <button className={view === 'settings' ? 'nav active' : 'nav'} onClick={() => setView('settings')}>定制设置</button>
        </nav>
        <span className="muted">451号文 · 宇翔表二格式 · {db.projects.length} 个工程</span>
      </header>
      <main className="main">
        {(view === 'projects') && <Projects db={db} updateDb={updateDb} openProject={openProject} setView={setView} />}
        {view === 'detail' && project && <ProjectDetail db={db} project={project} updateDb={updateDb} back={() => setView('projects')} />}
        {view === 'detail' && !project && <div className="empty">该工程已被删除。</div>}
        {view === 'batch' && <Batch db={db} updateDb={updateDb} openProject={openProject} />}
        {view === 'settings' && <Settings db={db} updateDb={updateDb} />}
      </main>
    </div>
  );
}
