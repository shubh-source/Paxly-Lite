import React, { useState, useEffect } from 'react';
import { decryptMediaBlob } from '../../services/crypto';
import { Icons } from '../ui/Icons';

export default function EncryptedMedia({ src, encryptionKey, isVideo, ...props }) {
  const [localSrc, setLocalSrc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!src) {
      setLocalSrc(null);
      setLoading(false);
      return;
    }

    if (src.startsWith('blob:') || src.startsWith('data:')) {
      setLocalSrc(src);
      setLoading(false);
      return;
    }

    let isMounted = true;
    let objectUrl = null;

    setLoading(true);
    const token = localStorage.getItem('ros_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(src, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        if (encryptionKey) {
          return decryptMediaBlob(blob, encryptionKey);
        }
        return blob;
      })
      .then(finalBlob => {
        if (!isMounted) return;
        objectUrl = URL.createObjectURL(finalBlob);
        setLocalSrc(objectUrl);
        setLoading(false);
      })
      .catch(err => {
        if (!isMounted) return;
        console.error("Media load failed:", err);
        setLocalSrc(src);
        setLoading(false);
      });

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src, encryptionKey]);

  if (loading) {
    return (
      <div style={{ width: '100%', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>
        <div className="spinner-small" style={{ borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  if (isVideo) {
    return <video src={localSrc} {...props} />;
  }
  
  return <img src={localSrc} {...props} />;
}
