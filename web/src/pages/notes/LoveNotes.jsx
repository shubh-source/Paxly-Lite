import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import GiftReveal from '../../components/ui/GiftReveal';
import { Icons } from '../../components/ui/Icons';

const MOODS = ['💌', '❤️', '🥰', '✨', '🌹', '💫', '🎵', '🌙'];

export default function LoveNotes() {
  const nav = useNavigate();
  const [notes, setNotes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('💌');
  const [unlockDate, setUnlockDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoad, setInitLoad] = useState(true);

  useEffect(() => { fetchNotes(); }, []);

  const fetchNotes = async () => {
    try {
      const { data } = await api.get('/notes/');
      setNotes(data);
    } catch (err) {
      console.error("Failed to fetch notes", err);
    } finally {
      setInitLoad(false);
    }
  };

  const send = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await api.post('/notes/', { 
        title: mood, 
        content,
        unlock_at: unlockDate ? new Date(unlockDate).toISOString() : null
      });
      setContent(''); 
      setMood('💌'); 
      setUnlockDate('');
      setShowForm(false);
      await fetchNotes();
    } catch (err) {
      console.error("Failed to send note", err);
    } finally {
      setLoading(false);
    }
  };

  const deleteNote = async (id) => {
    try {
      await api.delete(`/notes/${id}`);
      setNotes(n => n.filter(x => x.id !== id));
    } catch (err) {
      console.error("Failed to delete note", err);
    }
  };

  const openNote = async (id) => {
    try {
      await api.post(`/notes/${id}/open`);
      setNotes(prev => prev.map(n => n.id === id ? { ...n, is_opened: true } : n));
    } catch {}
  };

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      {/* Premium Header */}
      <header className="header" style={{ 
        background: 'rgba(22, 22, 24, 0.4)', 
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        margin: '20px 20px 12px',
        borderRadius: '24px',
        padding: '16px 20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/dashboard" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}><Icons.Back size={24} /></Link>
          <span className="header-title" style={{ color: 'var(--text)' }}>Love Notes</span>
        </div>
        <button className="btn btn-p" onClick={() => setShowForm(true)} style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Plus size={18} color="#000" /> New Note
        </button>
      </header>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ 
            background: 'rgba(22, 22, 26, 0.95)', 
            borderRadius: '32px 32px 0 0', 
            padding: 28, 
            width: '100%', 
            maxWidth: 600, 
            margin: '0 auto',
            boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem' }}>Write a Love Note</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}><Icons.Plus size={24} style={{ transform: 'rotate(45deg)' }} /></button>
            </div>
            
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
              {MOODS.map(m => (
                <button 
                  key={m} 
                  onClick={() => setMood(m)} 
                  style={{ 
                    fontSize: '1.6rem', 
                    background: mood === m ? 'rgba(201,169,110,0.15)' : 'rgba(255,255,255,0.03)', 
                    border: mood === m ? '2px solid var(--accent)' : '2px solid transparent', 
                    borderRadius: 16, 
                    width: 54,
                    height: 54,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >{m}</button>
              ))}
            </div>

            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write something beautiful..."
              style={{ 
                width: '100%', 
                minHeight: 140, 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: 20, 
                padding: 18, 
                color: 'var(--text)', 
                fontFamily: 'var(--font-b)', 
                fontSize: '1rem', 
                resize: 'none', 
                boxSizing: 'border-box',
                outline: 'none',
                marginBottom: 20
              }}
            />

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 600 }}>Lock as Time Capsule (Optional)</label>
              <input 
                type="datetime-local" 
                value={unlockDate}
                onChange={e => setUnlockDate(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '12px 16px', 
                  background: 'rgba(255,255,255,0.03)', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: 16, 
                  color: '#fff',
                  fontFamily: 'var(--font-b)',
                  outline: 'none',
                  boxSizing: 'border-box'
                }} 
              />
              <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--purple)' }}>If set, the note will remain a locked gift box until this exact time.</p>
            </div>
            
            <button className="btn btn-p btn-full" onClick={send} disabled={loading || !content.trim()} style={{ padding: '16px', borderRadius: 18, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {loading ? 'Sending...' : (
                <>
                  Send to My Person <Icons.Heart size={18} color="#000" fill="#000" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: '10px 20px' }}>
        {initLoad ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
            <div className="loader" />
          </div>
        ) : notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '100px 0', opacity: 0.8 }}>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}><Icons.LoveNote size={64} color="var(--accent)" stroke={1} /></div>
            <h3 style={{ marginBottom: 8 }}>Your inbox is waiting</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Send a secret note to brighten their day.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {notes.map(note => (
              <div key={note.id} className="card card-hover" style={{ 
                position: 'relative', 
                borderLeft: `4px solid ${note.is_opened ? 'var(--accent)' : 'var(--purple)'}`,
                padding: 20,
                background: 'rgba(255,255,255,0.03)',
                animation: 'fadeIn 0.5s ease-out'
              }}>
                {(!note.is_opened && note.created_by !== localStorage.getItem('ros_user_id')) && (
                  <GiftReveal 
                    variant="inline" 
                    title="You've got a note!" 
                    onOpen={() => openNote(note.id)} 
                  />
                )}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'flex-start', 
                  marginBottom: 12, 
                  visibility: (!note.is_opened && note.created_by !== localStorage.getItem('ros_user_id')) ? 'hidden' : 'visible' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.8rem' }}>{note.title || '💌'}</span>
                    <div>
                      <span style={{ fontSize: '0.88rem', color: 'var(--accent)', fontWeight: 600, display: 'block' }}>{note.sender_name || 'Partner'}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{new Date(note.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button onClick={() => deleteNote(note.id)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--muted)', cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.Trash size={16} /></button>
                </div>
                {note.unlock_at && new Date(note.unlock_at) > new Date() ? (
                  <div style={{ 
                    padding: 20, 
                    background: 'rgba(0,0,0,0.2)', 
                    borderRadius: 16, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 16, 
                    border: '1px dashed rgba(201,169,110,0.3)' 
                  }}>
                    <Icons.Lock size={32} color="var(--muted)" />
                    <div>
                      <h4 style={{ margin: '0 0 4px', color: 'var(--accent)' }}>Time Capsule Locked</h4>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>Unlocks on {new Date(note.unlock_at).toLocaleString()}</p>
                    </div>
                  </div>
                ) : (
                  <p style={{ 
                    margin: 0, 
                    lineHeight: 1.7, 
                    fontSize: '1rem', 
                    color: 'var(--text)',
                    visibility: (!note.is_opened && note.created_by !== localStorage.getItem('ros_user_id')) ? 'hidden' : 'visible' 
                  }}>
                    {note.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
