import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

const AUD_LABEL = { all: 'Everyone', agent: 'Agents', manager: 'Managers' };
const BLANK_TASK = { title: '', description: '', audience: 'all', link: '', sort_order: 0, is_active: true };

export default function GettingStarted() {
  const navigate = useNavigate();
  const [role, setRole] = useState('agent');
  const canManage = role === 'manager' || role === 'admin' || role === 'super_admin';

  const [tasks, setTasks] = useState([]);
  const [err, setErr] = useState('');
  const [manage, setManage] = useState(false);
  const [team, setTeam] = useState([]);
  const [draft, setDraft] = useState(null); // new/edit task or null

  useEffect(() => { api('/me').then((m) => setRole(m.profile?.role || 'agent')).catch(() => {}); }, []);

  async function load() {
    try { setTasks(await api('/onboarding/tasks')); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (canManage) api('/onboarding/team').then(setTeam).catch(() => {}); }, [canManage, tasks]);

  const done = tasks.filter((t) => t.completed_at).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  async function toggle(t) {
    setErr('');
    try {
      if (t.completed_at) await api(`/onboarding/tasks/${t.id}/complete`, { method: 'DELETE' });
      else await api(`/onboarding/tasks/${t.id}/complete`, { method: 'POST' });
      load();
    } catch (e) { setErr(e.message); }
  }

  function openLink(link) {
    if (!link) return;
    if (link.startsWith('kb:')) navigate(`/help?article=${encodeURIComponent(link.slice(3))}`);
    else if (link.startsWith('/')) navigate(link);
    else window.open(link, '_blank', 'noopener');
  }

  // ---- manage ----
  const setD = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  async function saveTask() {
    setErr('');
    try {
      const payload = { ...draft, sort_order: Number(draft.sort_order) || 0 };
      if (draft.id) await api(`/onboarding/tasks/${draft.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/onboarding/tasks', { method: 'POST', body: JSON.stringify(payload) });
      setDraft(null); load();
    } catch (e) { setErr(e.message); }
  }
  async function delTask(t) {
    if (!confirm('Delete this step?')) return;
    try { await api(`/onboarding/tasks/${t.id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); }
  }

  return (
    <Layout>
      <div className="page-head">
        <h1>Getting Started</h1>
        <div className="row-actions">
          {canManage && (
            <button className={'btn-ghost' + (manage ? ' active' : '')} onClick={() => { setManage((m) => !m); setDraft(null); }}>
              {manage ? 'Done managing' : 'Manage steps'}
            </button>
          )}
          {manage && <button className="btn" onClick={() => setDraft({ ...BLANK_TASK, sort_order: tasks.length })}>New step</button>}
        </div>
      </div>
      {err && <p className="error">{err}</p>}

      {!manage && (
        <div className="card">
          <div className="onb-progress-head">
            <div className="section-title" style={{ margin: 0 }}>Your onboarding</div>
            <div className="muted">{done} of {tasks.length} complete</div>
          </div>
          <div className="onb-bar"><div className="onb-bar-fill" style={{ width: `${pct}%` }} /></div>
          {pct === 100 && tasks.length > 0 && <p className="ok" style={{ marginBottom: 0 }}>🎉 You're all set — nice work.</p>}
        </div>
      )}

      {draft && (
        <div className="card">
          <div className="section-title">{draft.id ? 'Edit step' : 'New step'}</div>
          <div className="form-grid">
            <div className="field full"><label>Title</label><input value={draft.title} onChange={setD('title')} /></div>
            <div className="field full"><label>Description</label><textarea value={draft.description} onChange={setD('description')} style={{ minHeight: 80 }} /></div>
            <div className="field"><label>Audience</label>
              <select value={draft.audience} onChange={setD('audience')}>
                <option value="all">Everyone</option><option value="agent">Agents</option><option value="manager">Managers only</option>
              </select>
            </div>
            <div className="field"><label>Sort order</label><input type="number" value={draft.sort_order} onChange={setD('sort_order')} /></div>
            <div className="field full"><label>Link (optional)</label>
              <input value={draft.link || ''} onChange={setD('link')} placeholder="/settings  ·  kb:article-slug  ·  https://…" />
            </div>
            <div className="field"><label>Active</label>
              <div className="checkbox-row"><input type="checkbox" checked={!!draft.is_active} onChange={setD('is_active')} /><span className="muted">Shown to new hires</span></div>
            </div>
          </div>
          <div className="row-actions" style={{ marginTop: 14 }}>
            <button className="btn" onClick={saveTask}>Save step</button>
            <button className="btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-title">{manage ? 'All steps' : 'Checklist'}</div>
        {tasks.length === 0 ? <p className="muted" style={{ marginBottom: 0 }}>No steps yet.</p> : (
          <ul className="onb-list">
            {tasks.map((t) => (
              <li key={t.id} className={'onb-item' + (t.completed_at ? ' done' : '')}>
                {!manage && (
                  <button className={'onb-check' + (t.completed_at ? ' on' : '')} onClick={() => toggle(t)} aria-label="toggle complete">
                    {t.completed_at ? '✓' : ''}
                  </button>
                )}
                <div className="onb-body">
                  <div className="onb-title">
                    {t.title}
                    {t.audience !== 'all' && <span className="badge sm">{AUD_LABEL[t.audience]}</span>}
                    {manage && !t.is_active && <span className="badge sm draft">Hidden</span>}
                  </div>
                  {t.description && <div className="onb-desc">{t.description}</div>}
                  <div className="row-actions" style={{ marginTop: 6 }}>
                    {t.link && !manage && <button className="link-btn" onClick={() => openLink(t.link)}>Open →</button>}
                    {manage && (
                      <>
                        <button className="btn-ghost btn-sm" onClick={() => setDraft({ ...t, link: t.link || '' })}>Edit</button>
                        <button className="btn-ghost btn-sm" onClick={() => delTask(t)}>Delete</button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && !manage && team.length > 0 && (
        <div className="card">
          <div className="section-title">Team onboarding progress</div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Name</th><th>Role</th><th>Progress</th></tr></thead>
              <tbody>
                {team.map((u) => {
                  const p = u.total ? Math.round((u.completed / u.total) * 100) : 0;
                  return (
                    <tr key={u.id}>
                      <td>{u.full_name || u.email}</td>
                      <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                      <td>
                        <div className="onb-bar mini"><div className="onb-bar-fill" style={{ width: `${p}%` }} /></div>
                        <span className="muted" style={{ fontSize: 12 }}>{u.completed}/{u.total}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
