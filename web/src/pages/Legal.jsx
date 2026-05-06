import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/ui/Icons';
import ReactMarkdown from 'react-markdown';

export default function Legal() {
  const [content, setContent] = useState('');
  const [type, setType] = useState('privacy'); // privacy | terms

  useEffect(() => {
    const file = type === 'privacy' ? '/PRIVACY_POLICY.md' : '/TERMS_OF_SERVICE.md';
    fetch(file)
      .then(res => res.text())
      .then(setContent);
  }, [type]);

  return (
    <div className="page" style={{ paddingBottom: 40 }}>
      <header className="header" style={{ 
        background: 'rgba(22, 22, 24, 0.4)', 
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        margin: '20px 20px 12px',
        borderRadius: '24px',
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Link to="/profile" style={{ color: 'var(--muted)' }}><Icons.Back size={24} /></Link>
        <span className="header-title" style={{ color: 'var(--text)' }}>Legal Center</span>
        <div style={{ width: 24 }} />
      </header>

      <div className="content" style={{ padding: '0 20px' }}>
        {/* Toggle Tabs */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 4, marginBottom: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
          <button 
            onClick={() => setType('privacy')}
            style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: type === 'privacy' ? 'var(--accent)' : 'transparent', color: type === 'privacy' ? '#000' : 'var(--muted)', fontWeight: 600, cursor: 'pointer', transition: '0.3s' }}
          >
            Privacy Policy
          </button>
          <button 
            onClick={() => setType('terms')}
            style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: type === 'terms' ? 'var(--accent)' : 'transparent', color: type === 'terms' ? '#000' : 'var(--muted)', fontWeight: 600, cursor: 'pointer', transition: '0.3s' }}
          >
            Terms of Service
          </button>
        </div>

        {/* Markdown Content */}
        <div className="legal-doc" style={{ 
          background: 'rgba(255,255,255,0.02)', 
          border: '1px solid rgba(255,255,255,0.05)', 
          borderRadius: 24, 
          padding: 24, 
          color: 'var(--text)', 
          lineHeight: 1.7, 
          fontSize: '0.92rem',
          maxHeight: '70vh',
          overflowY: 'auto'
        }}>
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>

        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <Icons.Shield size={32} color="var(--accent)" />
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Vlynxly uses Military-Grade Encryption to protect your emotional world.
          </p>
        </div>
      </div>

      <style>{`
        .legal-doc h1 { font-size: 1.5rem; margin-bottom: 20px; color: var(--accent); }
        .legal-doc h2 { font-size: 1.1rem; margin-top: 24px; margin-bottom: 12px; color: #fff; }
        .legal-doc p { margin-bottom: 16px; opacity: 0.8; }
        .legal-doc ul { margin-bottom: 16px; padding-left: 20px; }
        .legal-doc li { margin-bottom: 8px; opacity: 0.8; }
        .legal-doc hr { border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 24px 0; }
      `}</style>
    </div>
  );
}
