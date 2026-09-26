import React, { useState, useEffect } from 'react';
import { decryptMediaBlob } from '../../services/crypto';
import { Icons } from '../ui/Icons';

export default function EncryptedMedia({ src, encryptionKey, isVideo, ...props }) {
  const [localSrc, setLocalSrc] = useState(encryptionKey ? null : src);
  const [loading, setLoading] = useState(!!encryptionKey);

  useEffect(() => {
    if (encryptionKey && src) {
      setLoading(true);
      fetch(src)
        .then(res => res.blob())
        .then(blob => decryptMediaBlob(blob, encryptionKey))
        .then(decryptedBlob => {
          const url = URL.createObjectURL(decryptedBlob);
          setLocalSrc(url);
          setLoading(false);
        })
        .catch(err => {
          console.error("Media decryption failed:", err);
          setLocalSrc(src); // Fallback to raw src if decryption fails
          setLoading(false);
        });
    } else {
      setLocalSrc(src);
    }
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
