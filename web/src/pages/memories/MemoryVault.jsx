import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getMemories, deleteMemory } from '../../services/api';
import { format, parseISO } from 'date-fns';
import BottomNav from '../../components/layout/BottomNav';

export function MemoryVault() {
  const [memories, setMemories] = useState([]);

  useEffect(() => { getMemories().then(setMemories); }, []);

  const del = async (id) => {
    if (!confirm('Delete this memory?')) return;
    await deleteMemory(id);
    setMemories(m => m.filter(x => x.id !== id));
  };

  return (
    <div className="page" style={{ paddingBottom:80 }}>
      <header className="header" style={{ margin: '12px 20px', borderRadius: '16px', background: 'rgba(22, 22, 24, 0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Link to="/dashboard" style={{ color:'var(--muted)' }}>←</Link>
        <span className="header-title" style={{ color: 'var(--accent)' }}>The Vault</span>
        <Link to="/memories/add" className="btn btn-p" style={{ padding:'6px 16px', fontSize:'0.85rem', borderRadius: 12 }}>+ Add moment</Link>
      </header>
      <div className="content">
        {memories.length === 0 ? (
          <div style={{ textAlign:'center', marginTop:100, backdropFilter: 'blur(10px)', padding: 40, borderRadius: 24, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize:'4rem', marginBottom:20 }}>💎</div>
            <h3 style={{ marginBottom:12, fontSize: '1.4rem' }}>Your store of magic</h3>
            <p>Every trip, every first, every quiet moment belongs here.</p>
            <Link to="/memories/add" className="btn btn-p" style={{ marginTop:30, padding: '12px 24px' }}>Begin the Collection</Link>
          </div>
        ) : (
          <div style={{ 
            display:'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
            gap:24 
          }}>
            {memories.map(m => (
              <div key={m.id} className="card card-hover" style={{ 
                overflow:'hidden', 
                padding:0, 
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
              }}>
                <div style={{ position: 'relative', overflow: 'hidden' }}>
                  {m.image_url && (
                    <img 
                      src={m.image_url} 
                      alt={m.title} 
                      style={{ 
                        width:'100%', 
                        height:240, 
                        objectFit:'cover',
                        transition: 'transform 0.6s ease',
                      }} 
                      onContextMenu={e => !m.allow_download && e.preventDefault()}
                      className="memory-img"
                    />
                  )}
                  <div className="memory-gradient" style={{ 
                    position: 'absolute', 
                    inset: 0, 
                    background: 'linear-gradient(to bottom, transparent 60%, rgba(13,13,15,0.9))' 
                  }} />
                  {!m.allow_download && (
                    <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', padding: '4px 8px', borderRadius: 8, fontSize: '0.65rem', color: '#fff' }}>
                      🔒 PRIVATE
                    </div>
                  )}
                </div>
                <div style={{ padding:20, position: 'relative' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize:'1.1rem', marginBottom:4, fontWeight: 500 }}>{m.title}</h3>
                      <span style={{ fontSize:'0.75rem', color:'var(--accent)', fontWeight: 600, letterSpacing: '0.5px' }}>{m.date ? format(parseISO(m.date),'MMMM d, yyyy') : ''}</span>
                    </div>
                    <button onClick={() => del(m.id)} style={{ background:'rgba(255,255,255,0.05)', border:'none', borderRadius: '50%', cursor:'pointer', color:'var(--muted)', fontSize:'1rem', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                  </div>
                  {m.description && <p style={{ marginTop:12, fontSize:'0.88rem', lineHeight:1.6, color: 'var(--text)', opacity: 0.7 }}>{m.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`
        .card-hover:hover .memory-img { transform: scale(1.05); }
        .card-hover:hover { box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
      `}</style>
      <BottomNav />
    </div>
  );
}

export default MemoryVault;
