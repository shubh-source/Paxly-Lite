import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api, { getMemories, deleteMemory, getSpace } from '../../services/api';
import { format, parseISO } from 'date-fns';
import { Icons } from '../../components/ui/Icons';
import { wsService } from '../../services/websocket';
import { useAuth } from '../../context/AuthContext';
import { decryptMessage, decryptMediaBlob } from '../../services/crypto';
import EncryptedMedia from '../../components/chat/EncryptedMedia';
import MediaLightboxModal from '../../components/chat/MediaLightboxModal';
import { getScopedCachedPartner, setScopedCachedPartner, safeGetItem } from '../../services/chatCache';
import { fixUrl } from '../chat/Chat';

export function MemoryVault() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('photos'); // photos | videos | messages
  const [memories, setMemories] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [videos, setVideos] = useState([]);
  const [saveRequest, setSaveRequest] = useState(null);
  const [requestingSave, setRequestingSave] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fullscreenMedia, setFullscreenMedia] = useState(null);
  const pendingSaveMsgRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  const [partnerPk, setPartnerPk] = useState(() => {
    const cached = getScopedCachedPartner(user?.id, user?.couple_space_id);
    return cached?.public_key || user?.partner?.public_key || safeGetItem('paxly_partner_pk') || null;
  });

  const getPartnerPublicKey = () => {
    if (partnerPk) return partnerPk;
    const cached = getScopedCachedPartner(user?.id, user?.couple_space_id);
    if (cached?.public_key) return cached.public_key;
    return user?.partner?.public_key || safeGetItem('paxly_partner_pk') || null;
  };

  const resolveEncryptionKey = (desc) => {
    if (!desc || typeof desc !== 'string') return null;
    if (desc.startsWith('E2EE_KEY:')) return desc.substring(9);
    const sk = safeGetItem('paxly_sk') || localStorage.getItem('paxly_sk');
    const pk = getPartnerPublicKey();
    if (sk && pk) {
      try {
        const dec = decryptMessage(desc, sk, pk);
        if (dec && dec.startsWith('E2EE_KEY:')) {
          return dec.substring(9);
        }
      } catch {}
    }
    return null;
  };

  useEffect(() => {
    getSpace().then(d => {
      const pk = d?.partner?.public_key;
      if (pk) {
        setPartnerPk(pk);
        const sId = d.space_id || d.id || user?.couple_space_id;
        if (user?.id && sId) {
          setScopedCachedPartner(user.id, sId, d.partner);
        }
      }
    }).catch(() => {});
  }, [user?.id, user?.couple_space_id]);

  const saveDecryptedToPhone = async (m) => {
    try {
      const rawUrl = m.image_url;
      if (!rawUrl) return;
      const token = safeGetItem('ros_token') || localStorage.getItem('ros_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(fixUrl(rawUrl), { headers });
      if (!res.ok) throw new Error(`Download failed with status ${res.status}`);
      let blob = await res.blob();
      
      const encryptionKey = resolveEncryptionKey(m.description);
      if (encryptionKey) {
        blob = await decryptMediaBlob(blob, encryptionKey);
      }
      
      let ext = 'jpg';
      const mime = blob.type || '';
      if (mime.includes('image/png')) ext = 'png';
      else if (mime.includes('image/jpeg') || mime.includes('image/jpg')) ext = 'jpg';
      else if (mime.includes('image/webp')) ext = 'webp';
      else if (mime.includes('video/mp4')) ext = 'mp4';
      else if (mime.includes('video/webm')) ext = 'webm';
      else if (m.image_url?.match(/\.(mp4|webm|mov|ogg)$/i)) ext = 'mp4';

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `vlynxly_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
    } catch (err) {
      alert(`Failed to save to device: ${err.message || 'Decryption error'}`);
    }
  };

  useEffect(() => { 
    const decryptItem = (m) => {
      if (m.description && typeof m.description === 'string' && !m.description.startsWith('E2EE_KEY:')) {
        const decKey = resolveEncryptionKey(m.description);
        if (decKey) {
          m.description = `E2EE_KEY:${decKey}`;
        }
      }
      return m;
    };

    // Load from cache first for instant UX
    const cached = localStorage.getItem('cached_memories');
    if (cached) {
      try {
        const data = JSON.parse(cached);
        if (Array.isArray(data)) {
          const texts = data.filter(m => !m.image_url).map(m => decryptItem({...m}));
          setMemories(texts);
          
          const savedMedia = data.filter(m => m.image_url).map(m => decryptItem({...m}));
          const savedPhotos = savedMedia.filter(m => !m.image_url.match(/\.(mp4|webm|mov|ogg)$/i));
          const savedVideos = savedMedia.filter(m => m.image_url.match(/\.(mp4|webm|mov|ogg)$/i));
          setPhotos(savedPhotos);
          setVideos(savedVideos);
          setLoading(false);
        } else if (data && typeof data === 'object') {
          if (data.texts) setMemories(data.texts.map(m => decryptItem({...m})));
          if (data.photos) setPhotos(data.photos.map(m => decryptItem({...m})));
          if (data.videos) setVideos(data.videos.map(m => decryptItem({...m})));
          setLoading(false);
        }
      } catch {}
    }

    Promise.all([
      getMemories().catch(() => []),
      api.get('/memories/media?type=image').then(r => r.data).catch(() => []),
      api.get('/memories/media?type=video').then(r => r.data).catch(() => [])
    ]).then(async ([rawMemories, chatImages, chatVideos]) => {
      const decryptChunked = async (arr) => {
        const result = [];
        for (let i = 0; i < arr.length; i += 20) {
          const chunk = arr.slice(i, i + 20);
          for (const m of chunk) result.push(decryptItem(m));
          await new Promise(r => setTimeout(r, 0));
        }
        return result;
      };

      const texts = await decryptChunked((rawMemories || []).filter(m => !m.image_url));
      setMemories(texts);

      const savedPhotos = await decryptChunked((rawMemories || []).filter(m => m.image_url && !m.image_url.match(/\.(mp4|webm|mov|ogg)$/i)));
      const fetchedPhotos = await decryptChunked(chatImages || []);
      const allPhotos = [...savedPhotos, ...fetchedPhotos];
      const uniquePhotos = Array.from(new Map(allPhotos.map(item => [item.image_url, item])).values());
      setPhotos(uniquePhotos);

      const savedVideos = await decryptChunked((rawMemories || []).filter(m => m.image_url && m.image_url.match(/\.(mp4|webm|mov|ogg)$/i)));
      const fetchedVideos = await decryptChunked(chatVideos || []);
      const allVideos = [...savedVideos, ...fetchedVideos];
      const uniqueVideos = Array.from(new Map(allVideos.map(item => [item.image_url, item])).values());
      setVideos(uniqueVideos);

      localStorage.setItem('cached_memories', JSON.stringify({
        texts,
        photos: uniquePhotos,
        videos: uniqueVideos
      }));
      setLoading(false);
    }).catch(() => setLoading(false));

    // Check for pending save requests from partner
    api.get('/chat/media-save-pending').then(res => {
      if (res.data && res.data.length > 0) {
        setSaveRequest(res.data[0]);
      }
    }).catch(() => {});
    
    const offs = [
      wsService.on('chat_message', msg => {
        if (msg.media_url && !msg.is_once_view && (msg.message_type === 'image' || msg.message_type === 'video')) {
          const isVideo = msg.message_type === 'video' || msg.media_url.match(/\.(mp4|webm|mov|ogg)$/i);
          const newMedia = decryptItem({
            id: msg.id || msg.temp_id,
            title: isVideo ? 'Chat Video' : 'Chat Photo',
            description: msg.text || '',
            image_url: msg.media_url,
            date: format(new Date(), 'yyyy-MM-dd'),
            created_by: msg.sender_id,
            created_at: new Date().toISOString()
          });
          if (isVideo) {
            setVideos(prev => [newMedia, ...prev.filter(v => v.image_url !== msg.media_url)]);
          } else {
            setPhotos(prev => [newMedia, ...prev.filter(p => p.image_url !== msg.media_url)]);
          }
        }
      }),
      wsService.on('media_save_response', async d => {
        if (d.request_id && String(d.request_id) !== String(user?.id)) return;
        setRequestingSave(false);
        if (!d || !d.allowed) {
          alert(`🚫 ${d.partner_name || 'Partner'} denied your save request.`);
          return;
        }
        const target = pendingSaveMsgRef.current;
        if (target) {
          await saveDecryptedToPhone(target);
        }
      }),
      wsService.on('vault_download_response', async d => {
        setRequestingSave(false);
        if (d.allowed) {
          const memory = [...memories, ...photos, ...videos].find(m => m.id === d.memory_id) || pendingSaveMsgRef.current;
          if (memory && memory.image_url) {
            await saveDecryptedToPhone(memory);
          }
        } else {
          alert(`🚫 ${d.partner_name || 'Partner'} denied your download request.`);
        }
      }),
      wsService.on('media_save_request', d => {
        if (String(d.sender_id) !== String(user?.id)) {
          setSaveRequest({ from: d.from || 'Your partner', ...d });
        }
      }),
      wsService.on('vault_download_request', d => {
        if (String(d.sender_id) !== String(user?.id)) {
          setSaveRequest({ from: d.from || 'Your partner', ...d });
        }
      })
    ];
    return () => offs.forEach(off => off());
  }, [user?.id, partnerPk]);

  const del = async (id) => {
    if (!confirm('Delete this memory?')) return;
    await deleteMemory(id);
    setMemories(m => m.filter(x => x.id !== id));
    setPhotos(m => m.filter(x => x.id !== id));
    setVideos(m => m.filter(x => x.id !== id));
  };

  const cancelSaveRequest = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setRequestingSave(false);
    pendingSaveMsgRef.current = null;
  };

  const requestSave = async (m) => {
    // If it's user's own media, save directly to device gallery
    if (m.created_by === user?.id) {
      await saveDecryptedToPhone(m);
      return;
    }
    // If partner's media, request permission
    pendingSaveMsgRef.current = m;
    setRequestingSave(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setRequestingSave(false);
      pendingSaveMsgRef.current = null;
    }, 45000);

    wsService.sendMediaSaveRequest(m.image_url, m.id);
    api.post('/chat/media-save-request', {
      media_url: m.image_url,
      message_id: m.id
    }).catch(e => console.warn('Save request fallback error:', e));
  };

  const respondSave = (allowed) => {
    if (!saveRequest) return;
    wsService.sendMediaSaveResponse(saveRequest.sender_id, allowed, saveRequest.message_id, saveRequest.media_url);
    api.post('/chat/media-save-respond', {
      request_id: saveRequest.sender_id,
      allowed,
      message_id: saveRequest.message_id,
      media_url: saveRequest.media_url,
      notification_id: saveRequest.notification_id || null
    }).catch(e => console.warn('Save response fallback error:', e));
    setSaveRequest(null);
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

      {/* Save Request Modal */}
      {saveRequest && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:9999999, display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(14px)' }}>
          <div className="card" style={{ maxWidth:350, width:'100%', textAlign:'center', border:'1px solid var(--accent)', padding:30, background:'#1c1815', borderRadius:22, boxShadow:'0 16px 48px rgba(0,0,0,0.9)' }}>
            <div style={{ marginBottom:16, display:'flex', justifyContent:'center' }}><Icons.Vault size={44} color="var(--accent)" /></div>
            <h3 style={{ marginBottom:6, color:'#fff', fontSize:'1.2rem' }}>Save Request</h3>
            <p style={{ fontSize:'0.92rem', color:'rgba(255,255,255,0.85)', marginBottom:24, lineHeight:1.5 }}>
              <b>{saveRequest.from || 'Your partner'}</b> wants to save a photo from memories to their phone. Allow?
            </p>
            <div style={{ display:'flex', gap:12 }}>
              <button className="btn btn-g" onClick={() => respondSave(false)} style={{ flex:1, padding:14, borderRadius:12, cursor:'pointer', background:'rgba(255,255,255,0.1)', color:'#fff' }}>Deny</button>
              <button className="btn btn-p" onClick={() => respondSave(true)} style={{ flex:1, padding:14, borderRadius:12, color:'#000', fontWeight:700, cursor:'pointer', background:'var(--accent)' }}>Allow Save</button>
            </div>
          </div>
        </div>
      )}

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
            <div className="loader" />
            <p style={{ marginTop: 16, color: 'var(--muted)', fontSize: '0.9rem' }}>Unlocking Vault...</p>
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign:'center', marginTop:100, backdropFilter: 'blur(10px)', padding: 40, borderRadius: 24, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}><Icons.Vault size={64} color="var(--accent)" stroke={1} /></div>
            <h3 style={{ marginBottom:12, fontSize: '1.4rem' }}>Empty Vault</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              {activeTab === 'photos' && "Photos shared in chat automatically appear here."}
              {activeTab === 'videos' && "Videos shared in chat automatically appear here."}
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
              const encryptionKey = resolveEncryptionKey(m.description);
              const isE2EEMedia = Boolean(encryptionKey);
              
              return (
              <div key={m.id} className="card card-hover" style={{ 
                overflow:'hidden', 
                padding:0, 
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
              }}>
                <div 
                  style={{ position: 'relative', overflow: 'hidden', cursor: m.image_url ? 'pointer' : 'default' }}
                  onClick={() => m.image_url && setFullscreenMedia({ ...m, media_url: m.image_url, message_type: activeTab === 'videos' ? 'video' : 'image', encryptionKey })}
                >
                  {m.image_url && (
                    activeTab === 'videos' ? (
                      <EncryptedMedia
                        isVideo 
                        src={fixUrl(m.image_url)} 
                        encryptionKey={encryptionKey}
                        controls
                        style={{ 
                          width:'100%', 
                          height:240, 
                          objectFit:'cover'
                        }} 
                        className="memory-img"
                      />
                    ) : (
                      <EncryptedMedia
                        src={fixUrl(m.image_url)} 
                        encryptionKey={encryptionKey}
                        alt={m.title} 
                        style={{ 
                          width:'100%', 
                          height:240, 
                          objectFit:'cover',
                          display: 'block'
                        }}
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
                </div>
                <div style={{ padding:20, position: 'relative' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize:'1.1rem', marginBottom:4, fontWeight: 500 }}>{m.title}</h3>
                      <span style={{ fontSize:'0.75rem', color:'var(--accent)', fontWeight: 600, letterSpacing: '0.5px' }}>{m.date ? format(parseISO(m.date),'MMMM d, yyyy') : ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button 
                        onClick={() => del(m.id)} 
                        style={{ background:'rgba(255,255,255,0.05)', border:'none', borderRadius: '50%', cursor:'pointer', color:'var(--muted)', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Delete memory"
                      >
                        <Icons.Trash size={16} />
                      </button>
                      {m.image_url && (
                        <button 
                          onClick={() => requestSave(m)} 
                          style={{ background:'rgba(201,169,110,0.15)', border:'none', borderRadius: '50%', cursor:'pointer', color:'var(--accent)', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Save to Phone"
                        >
                          <Icons.Download size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  {m.description && !isE2EEMedia && !m.description.startsWith('E2EE_KEY:') && (m.description.length < 60 || m.description.includes(' ')) && <p style={{ marginTop:12, fontSize:'0.88rem', lineHeight:1.6, color: 'var(--text)', opacity: 0.7 }}>{m.description}</p>}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Fullscreen Media Lightbox Modal */}
      {fullscreenMedia && (
        <MediaLightboxModal
          msg={fullscreenMedia}
          isOwn={fullscreenMedia.created_by === user?.id}
          encryptionKey={fullscreenMedia.encryptionKey}
          onClose={() => setFullscreenMedia(null)}
          onDownload={saveDecryptedToPhone}
          onRequestSave={requestSave}
        />
      )}

      {/* Requesting save banner */}
      {requestingSave && (
        <div style={{ position:'fixed', top:80, left:'50%', transform:'translateX(-50%)', background:'var(--accent)', color:'#000', padding:'10px 18px', borderRadius:99, fontWeight:700, zIndex:500, boxShadow:'0 8px 22px rgba(201,169,110,0.3)', display:'flex', alignItems:'center', gap:10, whiteSpace:'nowrap', fontSize:'0.88rem' }}>
          <div className="spinner-small" style={{ borderTopColor:'#000' }} />
          <span>Requesting Permission…</span>
          <button 
            onClick={cancelSaveRequest}
            style={{ background:'rgba(0,0,0,0.15)', border:'none', borderRadius:99, padding:'3px 8px', color:'#000', fontSize:'0.75rem', fontWeight:800, cursor:'pointer', marginLeft:4 }}
          >
            Cancel
          </button>
        </div>
      )}

      <style>{`
        .card-hover:hover .memory-img { transform: scale(1.05); }
        .card-hover:hover { box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
      `}</style>
    </div>
  );
}

export default MemoryVault;