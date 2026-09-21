import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';
import { renderMarkdown } from '../lib/md.js';

const AUD_LABEL = { all: 'Everyone', agent: 'Agents', manager: 'Managers' };

export default function Help() {
  const [role, setRole] = useState('agent');
  const canManage = role === 'manager' || role === 'admin' || role === 'super_admin';

  const [cats, setCats] = useState([]);
  const [articles, setArticles] = useState([]);
  const [activeCat, setActiveCat] = useState('');   // '' = all
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);   // full article being read
  const [editing, setEditing] = useState(null);     // article draft in editor, or null
  const [manage, setManage] = useState(false);
  const [err, setErr] = useState('');

  const loc = useLocation();
  useEffect(() => { api('/me').then((m) => setRole(m.profile?.role || 'agent')).catch(() => {}); }, []);

  // Deep link from an onboarding step: /help?article=<slug>
  useEffect(() => {
    const slug = new URLSearchParams(loc.search).get('article');
    if (slug) openArticle(slug);
  }, [loc.search]); // eslint-disable-line

  async function loadCats() {
    try { setCats(await api('/kb/categories')); } catch (e) { setErr(e.message); }
  }
  async function loadArticles() {
    try {
      const params = new URLSearchParams();
      if (activeCat) params.set('category', activeCat);
      if (q.trim()) params.set('q', q.trim());
      if (manage) params.set('manage', '1');
      setArticles(await api(`/kb/articles?${params.toString()}`));
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { loadCats(); }, []);
  useEffect(() => { const t = setTimeout(loadArticles, 200); return () => clearTimeout(t); }, [activeCat, q, manage]);

  async function openArticle(id) {
    setErr(''); setEditing(null);
    try { setSelected(await api(`/kb/articles/${id}`)); } catch (e) { setErr(e.message); }
  }

  const catName = useMemo(() => {
    const m = {}; cats.forEach((c) => { m[c.id] = c.name; }); return m;
  }, [cats]);

  function newArticle() {
    setSelected(null);
    setEditing({ title: '', body: '', category_id: activeCat || '', audience: 'all', is_published: true, sort_order: 0 });
  }
  function editArticle() {
    if (!selected) return;
    setEditing({ ...selected, category_id: selected.category_id || '' });
  }
  async function saveArticle() {
    setErr('');
    try {
      const payload = {
        title: editing.title, body: editing.body,
        category_id: editing.category_id || null,
        audience: editing.audience, is_published: editing.is_published,
        sort_order: Number(editing.sort_order) || 0
      };
      const saved = editing.id
        ? await api(`/kb/articles/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await api('/kb/articles', { method: 'POST', body: JSON.stringify(payload) });
      setEditing(null); setSelected(saved); loadArticles();
    } catch (e) { setErr(e.message); }
  }
  async function deleteArticle() {
    if (!selected || !confirm('Delete this article?')) return;
    try { await api(`/kb/articles/${selected.id}`, { method: 'DELETE' }); setSelected(null); loadArticles(); }
    catch (e) { setErr(e.message); }
  }

  async function addCategory() {
    const name = prompt('New category name:');
    if (!name) return;
    try { await api('/kb/categories', { method: 'POST', body: JSON.stringify({ name, sort_order: cats.length }) }); loadCats(); }
    catch (e) { setErr(e.message); }
  }

  const setE = (k) => (e) => setEditing((d) => ({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <Layout>
      <div className="page-head">
        <h1>Help &amp; Knowledge Base</h1>
        <div className="row-actions">
          {canManage && (
            <>
              <button className={'btn-ghost' + (manage ? ' active' : '')} onClick={() => setManage((m) => !m)}>
                {manage ? 'Done managing' : 'Manage'}
              </button>
              {manage && <button className="btn" onClick={newArticle}>New article</button>}
            </>
          )}
        </div>
      </div>
      {err && <p className="error">{err}</p>}

      <div className="kb-layout">
        <aside className="kb-side">
          <input className="kb-search" placeholder="Search articles…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="kb-cats">
            <button className={'kb-cat' + (activeCat === '' ? ' active' : '')} onClick={() => setActiveCat('')}>All articles</button>
            {cats.map((c) => (
              <button key={c.id} className={'kb-cat' + (activeCat === c.id ? ' active' : '')} onClick={() => setActiveCat(c.id)}>{c.name}</button>
            ))}
            {manage && <button className="kb-cat add" onClick={addCategory}>+ Add category</button>}
          </div>
          <div className="kb-list">
            {articles.length === 0 ? <p className="muted" style={{ padding: '8px 4px' }}>No articles.</p> :
              articles.map((a) => (
                <button key={a.id} className={'kb-item' + (selected?.id === a.id ? ' active' : '')} onClick={() => openArticle(a.id)}>
                  <span className="kb-item-title">{a.title}</span>
                  <span className="kb-item-meta">
                    {catName[a.category_id] || 'Uncategorized'}
                    {a.audience !== 'all' && <span className="badge sm">{AUD_LABEL[a.audience]}</span>}
                    {!a.is_published && <span className="badge sm draft">Draft</span>}
                  </span>
                </button>
              ))}
          </div>
        </aside>

        <section className="kb-main">
          {editing ? (
            <div className="card">
              <div className="section-title">{editing.id ? 'Edit article' : 'New article'}</div>
              <div className="form-grid">
                <div className="field full"><label>Title</label><input value={editing.title} onChange={setE('title')} /></div>
                <div className="field"><label>Category</label>
                  <select value={editing.category_id} onChange={setE('category_id')}>
                    <option value="">Uncategorized</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field"><label>Audience</label>
                  <select value={editing.audience} onChange={setE('audience')}>
                    <option value="all">Everyone</option>
                    <option value="agent">Agents</option>
                    <option value="manager">Managers only</option>
                  </select>
                </div>
                <div className="field"><label>Sort order</label><input type="number" value={editing.sort_order} onChange={setE('sort_order')} /></div>
                <div className="field"><label>Published</label>
                  <div className="checkbox-row"><input type="checkbox" checked={!!editing.is_published} onChange={setE('is_published')} /><span className="muted">Visible to readers</span></div>
                </div>
              </div>
              <div className="field full" style={{ marginTop: 14 }}>
                <label>Body (Markdown — # headings, **bold**, - lists, [links](url))</label>
                <textarea value={editing.body} onChange={setE('body')} style={{ minHeight: 320, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }} />
              </div>
              <div className="row-actions" style={{ marginTop: 16 }}>
                <button className="btn" onClick={saveArticle}>Save article</button>
                <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              </div>
              {editing.body && (
                <>
                  <div className="section-title" style={{ marginTop: 22 }}>Preview</div>
                  <div className="kb-article" dangerouslySetInnerHTML={{ __html: renderMarkdown(editing.body) }} />
                </>
              )}
            </div>
          ) : selected ? (
            <div className="card">
              <div className="row-actions" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: '0 0 4px' }}>{selected.title}</h2>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {catName[selected.category_id] || 'Uncategorized'}
                    {selected.audience !== 'all' && ` · ${AUD_LABEL[selected.audience]}`}
                    {selected.updated_at && ` · updated ${new Date(selected.updated_at).toLocaleDateString()}`}
                  </div>
                </div>
                {manage && (
                  <div className="row-actions">
                    <button className="btn-ghost btn-sm" onClick={editArticle}>Edit</button>
                    <button className="btn-ghost btn-sm" onClick={deleteArticle}>Delete</button>
                  </div>
                )}
              </div>
              <div className="kb-article" dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.body) }} />
            </div>
          ) : (
            <div className="card kb-empty">
              <p className="muted">Pick an article from the left, or search to find an answer fast.</p>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
