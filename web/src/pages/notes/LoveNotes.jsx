import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import GiftReveal from '../../components/ui/GiftReveal';
import JiggleGiftBoxModal from '../../components/ui/JiggleGiftBoxModal';
import GoldenDateTimePicker from '../../components/ui/GoldenDateTimePicker';
import { Icons } from '../../components/ui/Icons';
import { useAuth } from '../../context/AuthContext';
import { wsService } from '../../services/websocket';

const NOTE_THEMES = [
  { id: 'LoveNote', label: 'Note', Icon: Icons.LoveNote },
  { id: 'Heart', label: 'Love', Icon: Icons.Heart },
  { id: 'Sparkles', label: 'Magic', Icon: Icons.Sparkles },
  { id: 'Moon', label: 'Night', Icon: Icons.Moon },
  { id: 'Flame', label: 'Passion', Icon: Icons.Flame },
  { id: 'Wine', label: 'Romance', Icon: Icons.Wine },
  { id: 'Coffee', label: 'Warmth', Icon: Icons.Coffee },
  { id: 'Star', label: 'Special', Icon: Icons.Star },
];

function getNoteIcon(title) {
  if (title && Icons[title]) return Icons[title];
  if (title === '❤️' || title === '🥰' || title === '🌹') return Icons.Heart;
  if (title === '✨' || title === '💫') return Icons.Sparkles;
  if (title === '🌙') return Icons.Moon;
  if (title === '🍷') return Icons.Wine;
  if (title === '🎵') return Icons.Sparkles;
  return Icons.LoveNote;
}

export default function LoveNotes() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('LoveNote');
  const [unlockDate, setUnlockDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initLoad, setInitLoad] = useState(true);
  const [activeGiftNote, setActiveGiftNote] = useState(null);

  useEffect(() => { 
    const cached = localStorage.getItem('cached_lovenotes');
    if (cached) {
      try {
        setNotes(JSON.parse(cached));
        setInitLoad(false);
      } catch {}
    }
    fetchNotes(); 

    // Listen for live unlock events
    const offGift = wsService.on('love_note_gift', () => fetchNotes());
    const offAuthor = wsService.on('love_note_author_unlocked', () => fetchNotes());
    const offOpened = wsService.on('love_note_opened', () => fetchNotes());

    return () => {
      offGift();
      offAuthor();
      offOpened();
    };
  }, []);

  const fetchNotes = async () => {
    try {
      const { data } = await api.get('/notes/');
      localStorage.setItem('cached_lovenotes', JSON.stringify(data));
      setNotes(data);
    } catch (err) {
      console.error("Failed to fetch notes", err);
    } finally {
      setInitLoad(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const s = String(dateStr);
      const iso = s.endsWith('Z') ? s : s + 'Z';
      return new Date(iso).toLocaleDateString();
    } catch {
      return '';
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const s = String(dateStr);
      const iso = s.endsWith('Z') ? s : s + 'Z';
      return new Date(iso).toLocaleString();
    } catch {
      return '';
    }
  };

  const send = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      let unlockIso = null;
      if (unlockDate) {
        const d = new Date(unlockDate);
        if (!isNaN(d.getTime())) {
          unlockIso = d.toISOString();
        }
      }
      await api.post('/notes/', { 
        title: mood, 
        content,
        unlock_at: unlockIso,
        share_with_partner: true
      });
      setContent(''); 
      setMood('LoveNote'); 
      setUnlockDate('');
      setShowForm(false);
      await fetchNotes();
    } catch (err) {
      console.error("Failed to send note", err);
      alert(err.response?.data?.detail || "Failed to send love note. Please try again.");
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
              {NOTE_THEMES.map(m => {
                const IconComp = m.Icon;
                const isSelected = mood === m.id;
                return (
                  <button 
                    key={m.id} 
                    type="button"
                    onClick={() => setMood(m.id)} 
                    title={m.label}
                    style={{ 
                      background: isSelected ? 'rgba(201,169,110,0.18)' : 'rgba(255,255,255,0.03)', 
                      border: isSelected ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)', 
                      borderRadius: 16, 
                      width: 52,
                      height: 52,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: isSelected ? 'var(--accent)' : 'var(--muted)',
                      transition: 'all 0.2s',
                      boxShadow: isSelected ? '0 0 12px rgba(201,169,110,0.25)' : 'none'
                    }}
                  >
                    <IconComp size={22} color={isSelected ? 'var(--accent)' : 'var(--muted)'} />
                  </button>
                );
              })}
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

            {/* Custom Golden Charcoal Time Capsule Trigger Card */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ color: 'var(--accent)', fontSize: '0.88rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icons.Hourglass size={16} color="var(--accent)" /> Lock as Time Capsule (Optional)
                </label>
                {unlockDate && (
                  <button
                    type="button"
                    onClick={() => setUnlockDate('')}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Remove Lock
                  </button>
                )}
              </div>

              {unlockDate ? (
                <div 
                  onClick={() => setShowDatePicker(true)}
                  style={{
                    background: 'linear-gradient(135deg, rgba(201,169,110,0.14) 0%, rgba(28,28,34,0.85) 100%)',
                    border: '1px solid rgba(201,169,110,0.4)',
                    borderRadius: 20,
                    padding: '16px 18px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(201,169,110,0.25)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: 'rgba(201,169,110,0.2)',
                      border: '1px solid var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Icons.Gift size={22} color="var(--accent)" />
                    </div>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>
                        {new Date(unlockDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(unlockDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div style={{ color: 'var(--accent)', fontSize: '0.78rem', marginTop: 2, fontWeight: 500 }}>
                        Locked gift box until this time • Tap to adjust
                      </div>
                    </div>
                  </div>
                  <span style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Edit <Icons.Back size={12} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
                  </span>
                </div>
              ) : (
                <div 
                  onClick={() => setShowDatePicker(true)}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px dashed rgba(201,169,110,0.35)',
                    borderRadius: 20,
                    padding: '16px 18px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.background = 'rgba(201,169,110,0.06)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(201,169,110,0.35)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 14,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Icons.Hourglass size={18} color="var(--muted)" />
                    </div>
                    <div>
                      <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.9rem' }}>
                        Set Unlock Timer (Optional)
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 2 }}>
                        Leaves note sealed until a future anniversary or surprise moment
                      </div>
                    </div>
                  </div>
                  <span style={{ 
                    background: 'rgba(201,169,110,0.15)', 
                    color: 'var(--accent)', 
                    border: '1px solid rgba(201,169,110,0.3)',
                    padding: '6px 12px', 
                    borderRadius: 12, 
                    fontSize: '0.78rem', 
                    fontWeight: 700 
                  }}>
                    + Set Timer
                  </span>
                </div>
              )}
            </div>

            <GoldenDateTimePicker
              isOpen={showDatePicker}
              onClose={() => setShowDatePicker(false)}
              value={unlockDate}
              onChange={val => setUnlockDate(val || '')}
            />
            
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
                {(!note.is_opened && note.created_by !== user?.id && (!note.unlock_at || new Date(note.unlock_at.endsWith("Z") ? note.unlock_at : note.unlock_at + "Z") <= new Date())) && (
                  <div 
                    onClick={() => setActiveGiftNote(note)}
                    style={{ 
                      cursor: 'pointer',
                      padding: '16px',
                      borderRadius: 16,
                      background: 'linear-gradient(135deg, rgba(201,169,110,0.15) 0%, rgba(164,132,194,0.15) 100%)',
                      border: '1px solid rgba(201,169,110,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 42,
                        height: 42,
                        borderRadius: 14,
                        background: 'rgba(201,169,110,0.2)',
                        border: '1px solid var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: 'spinPulse 2s infinite'
                      }}>
                        <Icons.Gift size={22} color="var(--accent)" />
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <p style={{ margin: 0, fontWeight: 700, color: 'var(--accent)', fontSize: '0.95rem' }}>Surprise Gift Waiting!</p>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>Tap to unwrap this love note</p>
                      </div>
                    </div>
                    <button className="btn btn-p" style={{ padding: '6px 14px', fontSize: '0.78rem', borderRadius: 12 }}>
                      Unwrap
                    </button>
                  </div>
                )}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'flex-start', 
                  marginBottom: 12, 
                  visibility: (!note.is_opened && note.created_by !== user?.id) ? 'hidden' : 'visible' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {(() => {
                      const NoteIcon = getNoteIcon(note.title);
                      return (
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          background: 'rgba(201,169,110,0.14)',
                          border: '1px solid rgba(201,169,110,0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--accent)',
                          flexShrink: 0
                        }}>
                          <NoteIcon size={20} color="var(--accent)" />
                        </div>
                      );
                    })()}
                    <div>
                      <span style={{ fontSize: '0.88rem', color: 'var(--accent)', fontWeight: 600, display: 'block' }}>{note.created_by === user?.id ? 'You' : (note.sender_name || 'Partner')}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{formatDate(note.created_at)}</span>
                    </div>
                  </div>
                  <button onClick={() => deleteNote(note.id)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--muted)', cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.Trash size={16} /></button>
                </div>
                {note.unlock_at && new Date(note.unlock_at.endsWith("Z") ? note.unlock_at : note.unlock_at + "Z") > new Date() ? (
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
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>Unlocks on {formatDateTime(note.unlock_at)}</p>
                    </div>
                  </div>
                ) : (
                  <p style={{ 
                    margin: 0, 
                    lineHeight: 1.7, 
                    fontSize: '1rem', 
                    color: 'var(--text)',
                    visibility: (!note.is_opened && note.created_by !== user?.id) ? 'hidden' : 'visible' 
                  }}>
                    {note.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Jiggling Gift Box Surprise Modal */}
      {activeGiftNote && (
        <JiggleGiftBoxModal
          note={activeGiftNote}
          onClose={() => setActiveGiftNote(null)}
          onOpened={(id) => {
            setActiveGiftNote(null);
            setNotes(prev => prev.map(n => n.id === id ? { ...n, is_opened: true } : n));
          }}
        />
      )}
      
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spinPulse { 0%, 100% { transform: scale(1) rotate(0deg); } 50% { transform: scale(1.15) rotate(8deg); } }
      `}</style>
    </div>
  );
}




