import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import GiftReveal from '../../components/ui/GiftReveal';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('ros_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const MOODS = ['💌', '❤️', '🥰', '✨', '🌹', '💫', '🎵', '🌙'];

export default function LoveNotes() {
  const nav = useNavigate();
  const [notes, setNotes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('💌');
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchNotes(); }, []);

  const fetchNotes = async () => {
    const { data } = await api.get('/notes/');
    setNotes(data);
  };

  const send = async () => {
    if (!content.trim()) return;
    setLoading(true);
    await api.post('/notes/', { content, mood });
    setContent(''); setMood('💌'); setShowForm(false);
    await fetchNotes();
    setLoading(false);
  };

  const deleteNote = async (id) => {
    await api.delete(`/notes/${id}`);
    setNotes(n => n.filter(x => x.id !== id));
  };

  const openNote = async (id) => {
    try {
      await api.post(`/notes/${id}/open`);
      setNotes(prev => prev.map(n => n.id === id ? { ...n, is_opened: true } : n));
    } catch {}
  };

  return (
    <div className="page" style={{ padding: '0 0 80px' }}>
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => nav(-1)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem' }}>←</button>
          <div>
            <h2 style={{ margin: 0 }}>Love Notes</h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>Secret messages for your person</p>
          </div>
        </div>
        <button className="btn btn-p" onClick={() => setShowForm(true)} style={{ padding: '8px 16px' }}>+ Note</button>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'var(--s1)', borderRadius: '24px 24px 0 0', padding: 24, width: '100%', maxWidth: 600, margin: '0 auto' }}>
            <h3 style={{ marginBottom: 16 }}>Write a Love Note 💌</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {MOODS.map(m => (
                <button key={m} onClick={() => setMood(m)} style={{ fontSize: '1.4rem', background: mood === m ? 'var(--s2)' : 'transparent', border: mood === m ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>{m}</button>
              ))}
            </div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write something beautiful..."
              style={{ width: '100%', minHeight: 120, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, color: 'var(--text)', fontFamily: 'var(--font-b)', fontSize: '0.95rem', resize: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn btn-g" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-p" style={{ flex: 2 }} onClick={send} disabled={loading || !content.trim()}>{loading ? 'Sending...' : 'Send Note 💌'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 20px' }}>
        {notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>💌</div>
            <p>No love notes yet.</p>
            <p style={{ fontSize: '0.85rem' }}>Write the first one!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {notes.map(note => (
              <div key={note.id} className="card" style={{ position: 'relative', borderLeft: '3px solid var(--accent)', minHeight: 100 }}>
                {(!note.is_opened && note.created_by !== localStorage.getItem('ros_user_id')) && (
                  <GiftReveal 
                    variant="inline" 
                    title="You've got a note!" 
                    onOpen={() => openNote(note.id)} 
                  />
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, visibility: (!note.is_opened && note.created_by !== localStorage.getItem('ros_user_id')) ? 'hidden' : 'visible' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1.4rem' }}>{note.mood}</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 500 }}>{note.from_name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{new Date(note.created_at).toLocaleDateString()}</span>
                    <button onClick={() => deleteNote(note.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.9rem' }}>×</button>
                  </div>
                </div>
                <p style={{ margin: 0, lineHeight: 1.7, fontSize: '0.95rem', visibility: (!note.is_opened && note.created_by !== localStorage.getItem('ros_user_id')) ? 'hidden' : 'visible' }}>{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
