import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { Capacitor, registerPlugin } from '@capacitor/core';

const MediaFetcher = registerPlugin('MediaFetcher');

export default function AttachmentSheet({ isOpen, onClose, onFileSelect, onAction }) {
  const [recentPhotos, setRecentPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && Capacitor.isNativePlatform()) {
      fetchMedia();
    }
  }, [isOpen]);

  const fetchMedia = async () => {
    try {
      setLoading(true);
      const res = await MediaFetcher.getRecentMedia({ limit: 30 });
      if (res && res.media) {
        setRecentPhotos(res.media);
      }
    } catch (e) {
      console.error("Failed to fetch recent media", e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end'
        }}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--bg)',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: '24px 16px',
            boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Quick Actions Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            
            <ActionIcon icon={<Icons.Gallery size={28} color="#fff" />} label="Gallery" color="#bf59cf" onClick={() => onAction('gallery')} />
            <ActionIcon icon={<Icons.Camera size={28} color="#fff" />} label="Camera" color="#e83f5e" onClick={() => onAction('camera')} />
            <ActionIcon icon={<Icons.File size={28} color="#fff" />} label="Document" color="#5a68d4" onClick={() => onAction('document')} />
            <ActionIcon icon={<Icons.Sparkles size={28} color="#fff" />} label="AI Images" color="#16a085" onClick={() => onAction('ai')} />
            
          </div>

          {/* Recent Photos Horizontal Strip (Mobile Only) */}
          {Capacitor.isNativePlatform() && (
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 12 }}>Recent</div>
              
              <div style={{ 
                display: 'flex', 
                gap: 8, 
                overflowX: 'auto', 
                paddingBottom: 8,
                scrollbarWidth: 'none', // Firefox
                WebkitOverflowScrolling: 'touch'
              }}>
                {loading ? (
                  <div style={{ color: 'var(--muted)', fontSize: '0.8rem', padding: 10 }}>Loading recent photos...</div>
                ) : recentPhotos.length === 0 ? (
                  <div style={{ color: 'var(--muted)', fontSize: '0.8rem', padding: 10 }}>No recent photos found.</div>
                ) : (
                  recentPhotos.map(photo => {
                    const src = Capacitor.convertFileSrc(photo.path);
                    return (
                      <div 
                        key={photo.id}
                        onClick={() => {
                          onClose();
                          // Fetch the actual file blob to pass back to onFileSelect
                          fetch(src)
                            .then(r => r.blob())
                            .then(blob => {
                              const file = new File([blob], `photo_${photo.id}.jpg`, { type: 'image/jpeg' });
                              onFileSelect(file);
                            });
                        }}
                        style={{
                          width: 100,
                          height: 120,
                          borderRadius: 12,
                          flexShrink: 0,
                          background: '#222',
                          overflow: 'hidden',
                          cursor: 'pointer'
                        }}
                      >
                        <img 
                          src={src} 
                          alt="recent" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ActionIcon({ icon, label, color, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <div style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
      }}>
        {icon}
      </div>
      <span style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 500 }}>{label}</span>
    </div>
  );
}
