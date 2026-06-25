import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getMemories, deleteMemory } from '../../services/api';
import { format, parseISO } from 'date-fns';
import { Icons } from '../../components/ui/Icons';
import { wsService } from '../../services/websocket';
import { useAuth } from '../../context/AuthContext';
import { decryptMessage } from '../../services/crypto';
import EncryptedMedia from '../../components/chat/EncryptedMedia';

export function MemoryVault() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('photos'); // photos | videos | messages
  const [memories, setMemories] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [videos, setVideos] = useState([]);
  const [saveRequest, setSaveRequest] = useState(null);
  const [requestingSave, setRequestingSave] = useState(false);
  const [partnerName, setPartnerName] = useState('Partner');
  const [loading, setLoading] = useState(true);

  useEffect(() => { 
    const sk = localStorage.getItem('paxly_sk');
    const pk = user?.partner?.public_key;
    
    const decryptItem = (m) => {
      if (m.description && sk && pk && m.description.startsWith) {
         try {
           m.description = decryptMessage(m.description, sk, pk);
         } catch {}
      }
      return m;
    };

    // Load from cache first for instant UX
    const cached = localStorage.getItem('cached_memories');
    if (cached) {
      try {
        const data = JSON.parse(cached);
        const texts = data.filter(m => !m.image_url).map(m => decryptItem({...m}));
        setMemories(texts);
        
        const savedMedia = data.filter(m => m.image_url).map(m => decryptItem({...m}));
        const savedPhotos = savedMedia.filter(m => !m.image_url.match(/\.(mp4|webm|mov|ogg)$/i));
        const savedVideos = savedMedia.filter(m => m.image_url.match(/\.(mp4|webm|mov|ogg)$/i));
        setPhotos(savedPhotos);
        setVideos(savedVideos);
        setLoading(false); // Disable loading if cache exists
      } catch {}
    }

    getMemories().then(data => {
      localStorage.setItem('cached_memories', JSON.stringify(data));
      
      const texts = data.filter(m => !m.image_url).map(decryptItem);
      setMemories(texts);

      // Route explicitly saved media into Photos / Videos
      const savedMedia = data.filter(m => m.image_url).map(decryptItem);
      const savedPhotos = savedMedia.filter(m => !m.image_url.match(/\.(mp4|webm|mov|ogg)$/i));
      const savedVideos = savedMedia.filter(m => m.image_url.match(/\.(mp4|webm|mov|ogg)$/i));

      import('../../services/api').then(module => {
          module.default.get('/memories/media?type=image').then(res => {
              const fetchedPhotos = res.data.map(decryptItem);
              const allPhotos = [...savedPhotos, ...fetchedPhotos];
              const uniquePhotos = Array.from(new Map(allPhotos.map(item => [item.image_url, item])).values());
              setPhotos(uniquePhotos);
          }).catch(console.error);

          module.default.get('/memories/media?type=video').then(res => {
              const fetchedVideos = res.data.map(decryptItem);
              const allVideos = [...savedVideos, ...fetchedVideos];
              const uniqueVideos = Array.from(new Map(allVideos.map(item => [item.image_url, item])).values());
              setVideos(uniqueVideos);
          }).catch(console.error).finally(() => setLoading(false));
      }).catch(() => setLoading(false));
    }).catch(() => setLoading(false));
    
    const offs = [
      wsService.on('vault_download_response', d => {
        setRequestingSave(false);
        if (d.allowed) {
          const memory = [...memories, ...photos, ...videos].find(m => m.id === d.memory_id);
          if (memory && memory.image_url) {
            const link = document.createElement('a');
            link.href = memory.image_url;
            link.download = `vlynxly_vault_${Date.now()}`;
            link.click();
          }
        } else {
          alert(`🚫 ${d.partner_name || 'Partner'} denied your download request.`);
        }
      })
    ];
    return () => offs.forEach(off => off());
  }, [user?.id]);

  const del = async (id) => {
    if (!confirm('Delete this memory?')) return;
    await deleteMemory(id);
    setMemories(m => m.filter(x => x.id !== id));
    setPhotos(m => m.filter(x => x.id !== id));
    setVideos(m => m.filter(x => x.id !== id));
  };

  const requestSave = (m) => {
    setRequestingSave(true);
    wsService.sendVaultDownloadRequest(m.id, m.title || 'Photo');
  };

  const getActiveItems = () => {
    if (activeTab === 'photos') return photos;
    if (activeTab === 'videos') return videos;
    return memories;
  };

  const items = getActiveItems();

  return (
    <div className="page" style={{ paddingBottom:80 }}>
      <header className="header" style={{ 
        background: 'rgba(22, 22, 24, 0.4)', 
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        margin: '20px 20px 12px',
        borderRadius: '24px',
        padding: '16px 20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ position: 'absolute', left: 36 }}>
          <Link to="/dashboard" style={{ color:'var(--muted)', display: 'flex', alignItems: 'center' }}><Icons.Back size={24} /></Link>
        </div>
        <span className="header-title" style={{ color: 'var(--text)' }}>The Vault</span>
      </header>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, margin: '0 20px 24px' }}>
        {['photos', 'videos', 'messages'].map(t => (
          <button 
            key={t}
            onClick={() => setActiveTab(t)}
            style={{ 
              background: activeTab === t ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
              color: activeTab === t ? '#000' : '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 20,
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
              transition: 'all 0.2s',
              boxShadow: activeTab === t ? '0 4px 15px rgba(201,169,110,0.3)' : 'none'
            }}
          >
            {t === 'messages' ? 'Saved Messages' : t}
          </button>
        ))}
      </div>

      {requestingSave && (
        <div style={{ position: 'fixed', top: 100, left: '50%', transform: 'translateX(-50%)', background: 'var(--accent)', color: '#000', padding: '12px 24px', borderRadius: 99, fontWeight: 700, zIndex: 100, boxShadow: '0 10px 30px rgba(201,169,110,0.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="spinner-small" style={{ borderTopColor: '#000' }} /> Requesting Permission...
        </div>
      )}
      <div style={{ padding: '0 20px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 100, opacity: 0.7 }}>
            <div className="spin" style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(201,169,110,0.2)', borderTopColor: 'var(--accent)' }}></div>
            <p style={{ marginTop: 16, color: 'var(--muted)', fontSize: '0.9rem' }}>Unlocking Vault...</p>
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign:'center', marginTop:100, backdropFilter: 'blur(10px)', padding: 40, borderRadius: 24, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}><Icons.Vault size={64} color="var(--accent)" stroke={1} /></div>
            <h3 style={{ marginBottom:12, fontSize: '1.4rem' }}>Empty Vault</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              {activeTab === 'photos' && "Photos shared in chat will appear here."}
              {activeTab === 'videos' && "Videos shared in chat will appear here."}
              {activeTab === 'messages' && "Messages manually 'Saved to Vault' will appear here."}
            </p>
          </div>
        ) : (
          <div style={{ 
            display:'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
            gap:24 
          }}>
            {items.map(m => {
              const isE2EEMedia = m.description && m.description.startsWith('E2EE_KEY:');
              const encryptionKey = isE2EEMedia ? m.description.substring(9) : null;
              
              return (
              <div key={m.id} className="card card-hover" style={{ 
                overflow:'hidden', 
                padding:0, 
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
              }}>
                <div style={{ position: 'relative', overflow: 'hidden' }}>
                  {m.image_url && (
                    activeTab === 'videos' ? (
                      <EncryptedMedia
                        isVideo 
                        src={m.image_url} 
                        encryptionKey={encryptionKey}
                        controls
                        style={{ 
                          width:'100%', 
                          height:240, 
                          objectFit:'cover'
                        }} 
                        onContextMenu={e => !m.allow_download && e.preventDefault()}
                        className="memory-img"
                      />
                    ) : (
                      <EncryptedMedia
                        src={m.image_url} 
                        encryptionKey={encryptionKey}
                        alt={m.title} 
                        style={{ 
                          width:'100%', 
                          height:240, 
                          objectFit:'cover',
                          display: 'block'
                        }}
                        onContextMenu={e => !m.allow_download && e.preventDefault()}
                        className="memory-img"
                      />
                    )
                  )}
                  {m.image_url && <div className="memory-gradient" style={{ 
                    position: 'absolute', 
                    inset: 0, 
                    background: 'linear-gradient(to bottom, transparent 60%, rgba(13,13,15,0.9))',
                    pointerEvents: 'none'
                  }} />}
                  {!m.allow_download && (
                    <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', padding: '6px 10px', borderRadius: 10, fontSize: '0.65rem', color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Icons.Shield size={12} color="var(--accent)" /> PRIVATE
                    </div>
                  )}
                </div>
                <div style={{ padding:20, position: 'relative' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize:'1.1rem', marginBottom:4, fontWeight: 500 }}>{m.title}</h3>
                      <span style={{ fontSize:'0.75rem', color:'var(--accent)', fontWeight: 600, letterSpacing: '0.5px' }}>{m.date ? format(parseISO(m.date),'MMMM d, yyyy') : ''}</span>
                    </div>
                    {m.image_url && (
                      <button onClick={() => requestSave(m)} style={{ background:'rgba(201,169,110,0.1)', border:'none', borderRadius: '50%', cursor:'pointer', color:'var(--accent)', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.Download size={16} /></button>
                    )}
                  </div>
                  {m.description && <p style={{ marginTop:12, fontSize:'0.88rem', lineHeight:1.6, color: 'var(--text)', opacity: 0.7 }}>{m.description}</p>}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
      <style>{`
        .card-hover:hover .memory-img { transform: scale(1.05); }
        .card-hover:hover { box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
      `}</style>
    </div>
  );
}

export default MemoryVault;
