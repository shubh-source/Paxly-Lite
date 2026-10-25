import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icons } from '../components/ui/Icons';
import ReactMarkdown from 'react-markdown';

export default function Legal({ initialTab }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine initial tab from props or query param ?tab=privacy|terms|cookies
  const getInitialTab = () => {
    if (initialTab) return initialTab;
    const params = new URLSearchParams(location.search);
    const qTab = params.get('tab');
    if (qTab === 'terms' || qTab === 'privacy' || qTab === 'cookies') return qTab;
    if (location.pathname.includes('/terms')) return 'terms';
    if (location.pathname.includes('/cookies')) return 'cookies';
    return 'privacy';
  };

  const [type, setType] = useState(getInitialTab); // 'privacy' | 'terms' | 'cookies'
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    const file = type === 'privacy' 
      ? '/PRIVACY_POLICY.md' 
      : type === 'cookies' 
      ? '/COOKIE_POLICY.md' 
      : '/TERMS_OF_SERVICE.md';
    fetch(file)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.text();
      })
      .then(text => {
        setContent(text);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load legal document:', err);
        setContent(
          type === 'privacy'
            ? '# Privacy Policy for Paxly\n\nPaxly is engineered privacy-first. All messages and media in your sanctuary are end-to-end encrypted. We never sell your personal data or intimate moments to third parties.'
            : type === 'cookies'
            ? '# Cookie & Local Storage Policy for Paxly\n\nPaxly does not use advertising cookies or third-party trackers. We strictly use essential local storage for authentication and client-side encryption.'
            : '# Terms of Service for Paxly\n\nPaxly is a private space for consenting adult partners. By using the app, you agree to respect partner consent and applicable laws.'
        );
        setLoading(false);
      });
  }, [type]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/legal?tab=${type}`;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="page" style={{ paddingBottom: 60, minHeight: '100vh', background: 'var(--bg, #050505)', color: 'var(--text, #fff)' }}>
      {/* Header */}
      <header className="header" style={{
        background: 'rgba(22, 22, 24, 0.6)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        margin: '16px 20px 16px',
        borderRadius: '24px',
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      }}>
        <button
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/dashboard');
            }
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: 4,
          }}
          title="Back"
        >
          <Icons.Back size={24} />
        </button>

        <span className="header-title" style={{ color: 'var(--text)', fontWeight: 700, fontSize: '1.1rem' }}>
          Paxly Legal Center
        </span>

        <button
          onClick={handleCopyLink}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            color: copied ? 'var(--accent)' : 'var(--muted)',
            padding: '6px 10px',
            fontSize: '0.75rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
          title="Share legal document link"
        >
          <Icons.Copy size={14} />
          <span>{copied ? 'Copied' : 'Share'}</span>
        </button>
      </header>

      <div className="content" style={{ maxWidth: 760, margin: '0 auto', padding: '0 20px' }}>
        {/* Toggle Tabs */}
        <div style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 18,
          padding: 5,
          marginBottom: 20,
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          gap: 6
        }}>
          <button
            onClick={() => setType('privacy')}
            style={{
              flex: 1,
              padding: '11px 12px',
              borderRadius: 14,
              border: 'none',
              background: type === 'privacy' ? 'var(--accent, #c9a96e)' : 'transparent',
              color: type === 'privacy' ? '#000' : 'var(--muted)',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Icons.Shield size={16} /> Privacy Policy
          </button>
          <button
            onClick={() => setType('terms')}
            style={{
              flex: 1,
              padding: '11px 12px',
              borderRadius: 14,
              border: 'none',
              background: type === 'terms' ? 'var(--accent, #c9a96e)' : 'transparent',
              color: type === 'terms' ? '#000' : 'var(--muted)',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Icons.FileText size={16} /> Terms of Service
          </button>
          <button
            onClick={() => setType('cookies')}
            style={{
              flex: 1,
              padding: '11px 12px',
              borderRadius: 14,
              border: 'none',
              background: type === 'cookies' ? 'var(--accent, #c9a96e)' : 'transparent',
              color: type === 'cookies' ? '#000' : 'var(--muted)',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Icons.Lock size={16} /> Cookie Policy
          </button>
        </div>

        {/* Quick Trust Highlights Banner */}
        <div style={{
          background: 'rgba(201, 169, 110, 0.08)',
          border: '1px solid rgba(201, 169, 110, 0.22)',
          borderRadius: 16,
          padding: '14px 18px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <Icons.Shield size={24} color="var(--accent)" />
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--text)' }}>
              {type === 'privacy' 
                ? 'Privacy First Guarantee' 
                : type === 'cookies'
                ? 'Zero Tracking & Ad-Free Storage'
                : 'Consensual Intimate Sanctuary'}
            </strong>
            <p style={{ margin: '2px 0 0', lineHeight: 1.4 }}>
              {type === 'privacy'
                ? 'End-to-End Encrypted communications • Zero ad sales • Verified partner alerts with no transcript leaks.'
                : type === 'cookies'
                ? 'No marketing cookies or commercial pixels • Strictly essential JWT sessions & client cryptographic keys.'
                : '18+ adult relationships • Dual-consent storage • Zero tolerance for abuse or non-consensual media.'}
            </p>
          </div>
        </div>

        {/* Document Container */}
        <div className="legal-doc" style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 24,
          padding: '28px 26px',
          color: 'var(--text)',
          lineHeight: 1.8,
          fontSize: '0.92rem',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', opacity: 0.7 }}>
              <div className="loader" />
              <p style={{ marginTop: 14, color: 'var(--muted)', fontSize: '0.85rem' }}>Loading verified legal document...</p>
            </div>
          ) : (
            <ReactMarkdown>{content}</ReactMarkdown>
          )}
        </div>

        {/* Footer Notice */}
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0 }}>
            Questions regarding our policies? Contact our legal team at{' '}
            <a href="mailto:privacy@paxly.app" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              privacy@paxly.app
            </a>
          </p>
          <p style={{ fontSize: '0.7rem', opacity: 0.35, marginTop: 8 }}>
            Paxly Relationship OS • Verified Compliance 2026
          </p>
        </div>
      </div>

      <style>{`
        .legal-doc h1 { font-size: 1.55rem; margin-top: 8px; margin-bottom: 16px; color: var(--accent); font-weight: 800; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px; }
        .legal-doc h2 { font-size: 1.18rem; margin-top: 28px; margin-bottom: 12px; color: #fff; font-weight: 700; }
        .legal-doc h3 { font-size: 1.02rem; margin-top: 20px; margin-bottom: 8px; color: rgba(255,255,255,0.92); font-weight: 600; }
        .legal-doc p { margin-bottom: 14px; opacity: 0.88; }
        .legal-doc ul, .legal-doc ol { margin-bottom: 16px; padding-left: 22px; }
        .legal-doc li { margin-bottom: 8px; opacity: 0.88; }
        .legal-doc hr { border: 0; border-top: 1px solid rgba(255,255,255,0.08); margin: 28px 0; }
        .legal-doc a { color: var(--accent); text-decoration: underline; }
        .legal-doc strong { color: #fff; }
      `}</style>
    </div>
  );
}
