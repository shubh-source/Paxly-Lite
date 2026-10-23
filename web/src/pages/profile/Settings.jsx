import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api, { resolveMediaUrl } from '../../services/api';
import { Icons } from '../../components/ui/Icons';

// --- LEGAL CONTENT ---
const TERMS = [
  { heading: '1. Acceptance of Terms & Eligibility', body: 'By accessing or using Paxly, you agree to these Terms and Conditions. Paxly is built exclusively for consenting adults aged 18 and older in a personal or romantic partnership.' },
  { heading: '2. Private Couple Space & Credential Security', body: 'Paxly creates a private sanctuary strictly between two paired partners. You are responsible for safeguarding your login credentials, master password, and app PIN. You must not share access with unauthorized third parties.' },
  { heading: '3. Dual-Consent & Intimate Content Protection', body: 'Intimate media and memory preservation require mutual respect. Actions involving the permanent export of shared photos or videos to external device storage adhere to mutual consent rules. Circumventing technical safeguards is strictly prohibited.' },
  { heading: '4. Aura AI Relationship Guidance & Crisis Protocol', body: 'Aura AI is an artificial intelligence companion designed for relationship reflection and emotional wellness. Aura is NOT a licensed therapist, psychologist, medical doctor, or emergency hotline. In situations of imminent self-harm, automated generic alerts may notify your linked partner without disclosing private chat contents.' },
  { heading: '5. Prohibited Conduct (Zero-Tolerance)', body: 'Paxly strictly prohibits non-consensual sharing of intimate imagery (NCII / revenge porn), domestic abuse, threats, harassment, extortion, stalking, or unlawful exploitation. Violations result in immediate permanent termination and referral to law enforcement where required.' },
  { heading: '6. Memory Preservation & Account Closure', body: 'Unlike ephemeral messaging apps, Paxly values shared relationship milestones. Upon account closure, partners can choose to keep joint scrapbook memories securely vaulted or request complete statutory erasure within 30 days.' }
];

const PRIVACY = [
  { heading: '1. Privacy-First Architecture & Zero Data Sales', body: 'Paxly is built privacy-first. We collect only the minimum data required to deliver your private sanctuary. We never sell, rent, monetize, or trade your personal data, chat logs, or emotional check-ins to advertisers or data brokers.' },
  { heading: '2. End-to-End Cryptography & Local Security', body: 'All intimate messages, voice whispers, and vault media are protected by client-side cryptographic keys derived on your device. We implement native screen-recording shields, app PIN protection, and stealth mode to guard against physical snooping.' },
  { heading: '3. Aura AI Safety Engine & Zero-Leak Guarantee', body: 'Aura AI only analyzes conversations during explicit user-directed sessions. If an imminent safety crisis is detected, a generic support alert may be sent strictly to your verified partner. Safety alerts NEVER include private chat transcripts, message quotes, or user prompts.' },
  { heading: '4. Data Principal Rights (DPDP 2023, GDPR & CCPA)', body: 'You retain full ownership of your memories. You can export your joint history in machine-readable JSON at any time, correct details, unlink partners, or invoke your Right to Erasure for complete permanent deletion within 30 days.' }
];

export default function Settings() {
  const { user, logoutUser, setUser } = useAuth();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSub = searchParams.get('sub');
  const [sub, setSub] = useState(initialSub || null); // 'profile' | 'security' | 'privacy' | 'relationship' | 'terms' | 'privacy-policy' | 'about' | 'closure' | 'logs'

  const logout = () => { logoutUser(); nav('/'); };

  // Router for sub-views
  if (sub === 'profile')      return <ProfileSub user={user} setUser={setUser} onBack={() => { setSearchParams({}); setSub(null); }} />;
  if (sub === 'security')     return <SecuritySub user={user} onBack={() => { setSearchParams({}); setSub(null); }} />;
  if (sub === 'privacy')      return <PrivacySub user={user} setUser={setUser} onBack={() => { setSearchParams({}); setSub(null); }} />;
  if (sub === 'relationship') return <RelationshipSub user={user} setUser={setUser} onBack={() => { setSearchParams({}); setSub(null); }} />;
  if (sub === 'terms')        return <LegalSub title="Terms & Conditions" content={TERMS} onBack={() => { setSearchParams({}); setSub(null); }} />;
  if (sub === 'privacy-policy') return <LegalSub title="Privacy Policy" content={PRIVACY} onBack={() => { setSearchParams({}); setSub(null); }} />;
  if (sub === 'about')        return <AboutSub onBack={() => { setSearchParams({}); setSub(null); }} />;
  if (sub === 'closure')      return <ClosureSub onBack={() => { setSearchParams({}); setSub(null); }} onRequested={logout} />;
  if (sub === 'logs')         return <IntruderLogsSub onBack={() => { setSearchParams({}); setSub(null); }} />;

  return (
    <div className="page" style={{ paddingBottom: 100 }}>
      {/* Premium Header */}
      <header className="header" style={{ 
        background: 'rgba(22, 22, 24, 0.4)', 
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        margin: '20px 20px 24px',
        borderRadius: '24px',
        padding: '16px 20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/profile" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}><Icons.Back size={24} /></Link>
          <span className="header-title" style={{ color: 'var(--text)' }}>Settings & Privacy</span>
        </div>
        <div style={{ width: 24 }} />
      </header>

      <div className="content" style={{ maxWidth: 560, padding: '0 20px' }}>
        {/* Profile Card */}
        <div className="card card-hover" onClick={() => setSub('profile')}
          style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32, cursor: 'pointer', padding: '20px', borderRadius: 24, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="avatar" style={{ width: 56, height: 56, fontSize: '1.3rem', flexShrink: 0, background: 'linear-gradient(135deg, var(--accent), var(--purple))', color: '#fff' }}>
            {user?.avatar_url ? <img src={user.avatar_url} style={{width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover'}} /> : <Icons.User size={32} color="#000" />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)', marginBottom: 2 }}>{user?.name}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{user?.email}</div>
          </div>
          <span style={{ color: 'var(--muted)', display: 'flex' }}><Icons.Back size={20} style={{ transform: 'rotate(180deg)' }} /></span>
        </div>

        {/* Categories */}
        <Category title="Account">
          <SettingRow icon={<Icons.User size={20} />} title="Profile Details" desc="Name and basic info" onClick={() => setSub('profile')} />
          <Divider />
          <SettingRow icon={<Icons.Lock size={20} />} title="Security" desc="Password, App PIN, Intruder Logs" onClick={() => setSub('security')} />
        </Category>

        <Category title="Privacy & Peace">
          <SettingRow icon={<Icons.Shield size={20} />} title="Privacy Settings" desc="Stealth Mode, Media Blur, Activity" onClick={() => setSub('privacy')} />
        </Category>

        <Category title="Relationship Intelligence">
          <SettingRow icon={<Icons.Aura size={20} />} title="AI & Milestones" desc="Aura AI tone, Relationship alerts" onClick={() => setSub('relationship')} />
          <Divider />
          <SettingRow icon={<Icons.Download size={20} />} title="Export Memories" desc="Download your digital scrapbook" onClick={async () => {
             try {
               const res = await api.get('/auth/export');
               const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
               const url = window.URL.createObjectURL(blob);
               const a = document.createElement('a');
               a.href = url; a.download = 'vlynxly_history.json'; a.click();
             } catch (err) { alert("Failed to export data"); }
          }} />
        </Category>

        <Category title="Information">
          <SettingRow icon={<Icons.FileText size={20} />} title="Terms & Conditions" onClick={() => setSub('terms')} />
          <Divider />
          <SettingRow icon={<Icons.Shield size={20} />} title="Privacy Policy" onClick={() => setSub('privacy-policy')} />
          <Divider />
          <SettingRow icon={<Icons.Info size={20} />} title="About Paxly" onClick={() => setSub('about')} />
        </Category>

        <Category title="App Closure">
          <SettingRow icon={<Icons.LogOut size={20} />} title="Log Out" titleColor="var(--muted)" onClick={logout} />
          <Divider />
          <SettingRow icon={<Icons.AlertCircle size={20} />} title="Request Account Closure" titleColor="var(--danger)" desc="Free your ID while preserving memories" onClick={() => setSub('closure')} />
        </Category>

        <p style={{ textAlign: 'center', fontSize: '0.72rem', opacity: 0.3, marginTop: 40, letterSpacing: 0.5 }}>
          Paxly v2.4.0 Premium · Memories Protected Forever
        </p>
      </div>
    </div>
  );
}

// --- SHARED COMPONENTS ---
function Category({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{ fontSize: '0.75rem', letterSpacing: '0.15em', color: 'var(--accent)', fontWeight: 700, marginBottom: 14, textTransform: 'uppercase', paddingLeft: 8 }}>{title}</p>
      <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 24 }}>{children}</div>
    </div>
  );
}

function SettingRow({ icon, title, desc, onClick, right, titleColor }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: onClick ? 'pointer' : 'default', transition: 'background 0.2s' }}
      onMouseEnter={e => onClick && (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <div style={{ fontSize: '1.3rem', width: 32, height: 32, display:'flex', alignItems:'center', justifyContent:'center', background: 'rgba(255,255,255,0.05)', borderRadius: 10 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: titleColor || 'var(--text)', marginBottom: desc ? 2 : 0 }}>{title}</div>
        {desc && <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{desc}</div>}
      </div>
      {right ? right : onClick ? <span style={{ color: 'var(--muted)', display: 'flex', opacity: 0.5 }}><Icons.Back size={18} style={{ transform: 'rotate(180deg)' }} /></span> : null}
    </div>
  );
}

function Divider() { return <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginLeft: 64 }} />; }

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 48, height: 26, borderRadius: 13, background: value ? 'var(--accent)' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'all 0.3s ease', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: value ? '#000' : 'var(--muted)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
    </div>
  );
}

// --- SUB-VIEWS ---

function SecuritySub({ user, onBack }) {
  const [sub, setSub] = useState(null); 
  const [pin, setPin] = useState('');
  const [pinOk, setPinOk] = useState(false);

  if (sub === 'password') return <PasswordSub onBack={() => setSub(null)} />;
  if (sub === 'logs') return <IntruderLogsSub onBack={() => setSub(null)} />;

  const updatePin = async () => {
    try {
      await api.post('/security/pin/set', { pin });
      if (user?.id) {
        const encoder = new TextEncoder();
        const data = encoder.encode(`paxly_pin_${user.id}_${pin}`);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('paxly_pin_hash', hash);
      }
      setPinOk(true);
      setTimeout(() => setPinOk(false), 2000);
    } catch { alert('PIN must be 4-6 digits.'); }
  };

  return (
    <div className="page">
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '20px 20px 24px', borderRadius: '24px', padding: '16px 20px' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Icons.Back size={20} /> Back</button>
        <span className="header-title" style={{ color: 'var(--text)' }}>Security</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 500, padding: '0 20px' }}>
        <Category title="Access Control">
          <SettingRow icon={<Icons.Lock size={20} />} title="Change Password" desc="Account login password" onClick={() => setSub('password')} />
          <Divider />
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <p style={{ margin: 0, color: 'var(--text)', fontWeight: 600, fontSize: '0.95rem' }}>App PIN</p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>4-6 digit numeric lock</p>
              </div>
              {pinOk && <span style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600 }}>Updated! ✓</span>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input type="password" className="inp" placeholder="New PIN" value={pin} onChange={e => setPin(e.target.value)} maxLength={6} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: 14 }} />
              <button className="btn btn-p" onClick={updatePin} disabled={!pin} style={{ padding: '0 20px', borderRadius: 14 }}>Save</button>
            </div>
          </div>
        </Category>
        
        <Category title="Surveillance">
          <SettingRow icon={<Icons.Camera size={20} />} title="Intruder Selfie Logs" desc="Photos of failed unlock attempts" onClick={() => setSub('logs')} />
          <Divider />
          <SettingRow icon={<Icons.Mic size={20} />} title="Auto-Lock Timer" desc="Locks app after 20s of inactivity" right={<span style={{ color: 'var(--accent)', fontWeight: 700 }}>20s</span>} />
        </Category>
      </div>
    </div>
  );
}

function PasswordSub({ onBack }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [ok, setOk] = useState('');

  const save = async () => {
    try {
      await api.post('/auth/password', { current_password: cur, new_password: next });
      setOk('Password updated!');
      setCur(''); setNext('');
      setTimeout(() => setOk(''), 3000);
    } catch (e) { alert(e.response?.data?.detail || 'Error updating password.'); }
  };

  return (
    <div className="page">
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '20px 20px 24px', borderRadius: '24px', padding: '16px 20px' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12 }}>← Back</button>
        <span className="header-title" style={{ color: 'var(--text)' }}>Password</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 440, padding: '0 20px' }}>
        {ok && <div className="alert alert-s" style={{ marginBottom: 20 }}>{ok}</div>}
        <div className="card" style={{ padding: 24, borderRadius: 24, background: 'rgba(255,255,255,0.03)' }}>
          <div className="inp-wrap" style={{ marginBottom: 16 }}>
            <label style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 8, display: 'block' }}>Current Password</label>
            <input type="password" className="inp" value={cur} onChange={e => setCur(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14 }} />
          </div>
          <div className="inp-wrap" style={{ marginBottom: 24 }}>
            <label style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 8, display: 'block' }}>New Password</label>
            <input type="password" className="inp" value={next} onChange={e => setNext(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14 }} />
          </div>
          <button className="btn btn-p btn-full" onClick={save} disabled={!cur || !next} style={{ padding: 16, borderRadius: 16, fontWeight: 600 }}>Change Password</button>
        </div>
      </div>
    </div>
  );
}

function IntruderLogsSub({ onBack }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    api.get('/security/intruder/logs')
      .then(r => setLogs(r.data || []))
      .catch(e => console.error('Failed to load intruder logs', e))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (logId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Delete this intruder selfie log?')) return;
    setDeletingId(logId);
    try {
      await api.delete(`/security/intruder/logs/${logId}`);
      setLogs(prev => prev.filter(l => l.id !== logId));
      if (selectedPhoto?.id === logId) setSelectedPhoto(null);
    } catch {
      alert('Failed to delete log.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page">
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '20px 20px 24px', borderRadius: '24px', padding: '16px 20px' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Back size={18} /> Back
        </button>
        <span className="header-title" style={{ color: 'var(--text)' }}>Intruder Logs</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 540, padding: '0 20px' }}>
        <p style={{ textAlign: 'center', marginBottom: 24, fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          Photos secretly captured after 3 consecutive wrong PIN unlock attempts.
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>Loading intruder logs...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {logs.map(log => (
              <div 
                key={log.id} 
                className="card" 
                onClick={() => setSelectedPhoto(log)}
                style={{ padding: 12, borderRadius: 20, background: 'rgba(255,255,255,0.03)', position: 'relative', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div style={{ position: 'relative', width: '100%', aspectRatio: '3/4', borderRadius: 12, overflow: 'hidden', marginBottom: 10, background: '#111' }}>
                  <img 
                    src={resolveMediaUrl(log.photo_url)} 
                    alt="Intruder capture"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  />
                  <button 
                    onClick={(e) => handleDelete(log.id, e)}
                    disabled={deletingId === log.id}
                    title="Delete log"
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.65)',
                      backdropFilter: 'blur(4px)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#FF453A',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    🗑
                  </button>
                </div>
                <p style={{ margin: 0, textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)' }}>
                  {log.timestamp ? new Date(String(log.timestamp).endsWith('Z') ? log.timestamp : `${log.timestamp}Z`).toLocaleString() : 'Unknown date'}
                </p>
              </div>
            ))}

            {logs.length === 0 && (
              <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '80px 0', opacity: 0.7 }}>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}><Icons.Shield size={64} color="var(--accent)" stroke={1.5} /></div>
                <h4 style={{ color: '#fff', marginBottom: 6 }}>All Secure</h4>
                <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No unauthorized unlock attempts have been detected.</p>
              </div>
            )}
          </div>
        )}

        {selectedPhoto && (
          <div 
            onClick={() => setSelectedPhoto(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.88)',
              backdropFilter: 'blur(10px)',
              zIndex: 999999,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20
            }}
          >
            <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
              <img 
                src={resolveMediaUrl(selectedPhoto.photo_url)} 
                alt="Intruder Full" 
                style={{ width: '100%', maxHeight: '70vh', borderRadius: 20, objectFit: 'contain', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }} 
              />
              <p style={{ color: '#fff', fontSize: '0.9rem', marginTop: 12, fontWeight: 600 }}>
                {selectedPhoto.timestamp ? new Date(String(selectedPhoto.timestamp).endsWith('Z') ? selectedPhoto.timestamp : `${selectedPhoto.timestamp}Z`).toLocaleString() : ''}
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
                <button 
                  className="btn btn-d"
                  onClick={() => handleDelete(selectedPhoto.id)}
                  style={{ background: '#FF3B30', color: '#fff', padding: '10px 20px', borderRadius: 12, fontSize: '0.85rem' }}
                >
                  Delete Log
                </button>
                <button 
                  className="btn btn-g"
                  onClick={() => setSelectedPhoto(null)}
                  style={{ padding: '10px 20px', borderRadius: 12, fontSize: '0.85rem' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PrivacySub({ user, setUser, onBack }) {
  const update = async (key, val) => {
    try {
      await api.patch('/security/preferences', { [key]: val });
      setUser({ ...user, [key]: val });
    } catch (err) { console.error(err); }
  };

  // Stealth Mode logic
  useEffect(() => {
    if (user?.stealth_mode) {
      document.title = "Notes";
      document.querySelector("link[rel~='icon']").href = "https://www.google.com/favicon.ico"; 
    } else {
      document.title = "Vlynxly";
      document.querySelector("link[rel~='icon']").href = "/favicon.ico";
    }
  }, [user?.stealth_mode]);

  return (
    <div className="page">
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '20px 20px 24px', borderRadius: '24px', padding: '16px 20px' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Icons.Back size={20} /> Back</button>
        <span className="header-title" style={{ color: 'var(--text)' }}>Privacy Fortress</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 500, padding: '0 20px' }}>
        <Category title="Visual Privacy">
          <SettingRow icon={<Icons.Aura size={20} />} title="Stealth Mode" desc="Disguises app title & lock screen" 
            right={<Toggle value={user?.stealth_mode} onChange={v => update('stealth_mode', v)} />} />
          {user?.stealth_mode && (
            <div style={{ padding: '0 20px 16px', marginTop: '-8px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8 }}>Disguise Lock Screen As</label>
              <select 
                value={user?.stealth_mode_app || 'calculator'} 
                onChange={e => update('stealth_mode_app', e.target.value)}
                style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, outline: 'none' }}
              >
                <option value="calculator" style={{ background: '#111' }}>Calculator (Math App)</option>
              </select>
              <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--purple)' }}>Enter your PIN on the calculator and press '=' to unlock.</p>
            </div>
          )}
          <Divider />
          <SettingRow icon={<Icons.Vault size={20} />} title="Media Blurring" desc="Blur images in chat until tapped" 
            right={<Toggle value={user?.blur_sensitive} onChange={v => update('blur_sensitive', v)} />} />
        </Category>

        <Category title="Identity Privacy">
          <SettingRow icon={<Icons.Shield size={20} />} title="Private Presence" desc="Hide when you are online or typing" 
            right={<Toggle value={user?.hide_activity} onChange={v => update('hide_activity', v)} />} />
        </Category>
      </div>
    </div>
  );
}

function RelationshipSub({ user, setUser, onBack }) {
  const update = async (key, val) => {
    try {
      await api.patch('/security/preferences', { [key]: val });
      setUser({ ...user, [key]: val });
    } catch (err) { console.error(err); }
  };

  const tones = [
    { id: 'friend',        label: 'Best Friend (Recommended)', desc: 'Warm, witty, and super casual' },
    { id: 'compassionate', label: 'Compassionate Advisor', desc: 'Gentle, supportive, and formal' },
    { id: 'professional',  label: 'Relationship Pro', desc: 'Direct, clear, and objective' },
  ];

  return (
    <div className="page">
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '20px 20px 24px', borderRadius: '24px', padding: '16px 20px' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12 }}>← Back</button>
        <span className="header-title" style={{ color: 'var(--text)' }}>Relationship IQ</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 500, padding: '0 20px' }}>
        <Category title="Aura AI Personality">
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tones.map(t => (
              <div key={t.id} onClick={() => update('ai_personality', t.id)}
                style={{ 
                  padding: '16px', 
                  borderRadius: 18, 
                  background: user?.ai_personality === t.id ? 'rgba(201,169,110,0.1)' : 'rgba(255,255,255,0.03)', 
                  border: '1px solid', 
                  borderColor: user?.ai_personality === t.id ? 'var(--accent)' : 'rgba(255,255,255,0.06)', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'all 0.2s'
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: user?.ai_personality === t.id ? 'var(--accent)' : 'var(--text)' }}>{t.label}</span>
                  {user?.ai_personality === t.id && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </Category>

        <Category title="Automation & Alerts">
          <SettingRow icon="🔔" title="Milestone Alerts" desc="Special day & anniversary reminders" 
            right={<Toggle value={user?.milestone_alerts} onChange={v => update('milestone_alerts', v)} />} />
        </Category>
      </div>
    </div>
  );
}

function ClosureSub({ onBack, onRequested }) {
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);

  const request = async () => {
    setLoading(true);
    try {
      await api.post('/auth/request-closure');
      setOk(true);
    } catch { alert('Error submitting request.'); }
    setLoading(false);
  };

  if (ok) {
    return (
      <div className="page center" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}><Icons.AlertCircle size={64} color="var(--accent)" /></div>
        <h2 style={{ fontSize: '1.8rem', marginBottom: 12 }}>Request Submitted</h2>
        <p style={{ lineHeight: 1.8, marginBottom: 40, color: 'var(--muted)', fontSize: '0.95rem' }}>A Vlynxly Relationship Executive will contact both you and your partner shortly to confirm the closure. Your shared memories and history are now protected in our vault and will **never** be deleted.</p>
        <button className="btn btn-p btn-full" onClick={onRequested} style={{ padding: 18, borderRadius: 18, fontWeight: 700 }}>Log Out Pending Review</button>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '20px 20px 24px', borderRadius: '24px', padding: '16px 20px' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Icons.Back size={20} /> Back</button>
        <span className="header-title" style={{ color: 'var(--text)' }}>Closure</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content center" style={{ maxWidth: 460, padding: '0 24px', textAlign: 'center' }}>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}><Icons.AlertCircle size={64} color="#FF3B30" /></div>
        <h2 style={{ color: '#FF3B30', fontSize: '2rem', marginBottom: 12, fontWeight: 800 }}>Closure Request</h2>
        <p style={{ marginBottom: 40, lineHeight: 1.8, color: 'var(--muted)', fontSize: '1rem' }}>We understand this may be a difficult time. Requesting closure allows you to free your account ID for a new start, while **preserving all your joint history forever** in our secure vault.</p>


        <div className="card" style={{ marginBottom: 40, textAlign: 'left', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,169,110,0.2)', padding: 24, borderRadius: 24 }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 16, fontWeight: 700, color: 'var(--accent)' }}>Vlynxly's Memory Guarantee:</h3>
          {[
            'Your shared history will NEVER be deleted', 
            'Every message and photo is preserved', 
            'Your ID will be freed after executive review', 
            'Memories are safe if you ever reconcile'
          ].map((g, i) => (
            <p key={i} style={{ fontSize: '0.88rem', marginBottom: 10, display: 'flex', gap: 10, color: '#fff' }}>
              <span style={{ color: 'var(--accent)' }}>✓</span> {g}
            </p>
          ))}
        </div>

        <button className="btn btn-d btn-full" onClick={request} disabled={loading} style={{ padding: 18, borderRadius: 18, fontWeight: 700, background: '#FF3B30' }}>
          {loading ? 'Submitting...' : 'Confirm Closure Request'}
        </button>
        <p style={{ marginTop: 20, fontSize: '0.8rem', color: 'var(--muted)' }}>An executive will contact both partners within 24-48 hours.</p>
      </div>
    </div>
  );
}

function ProfileSub({ user, setUser, onBack }) {
  const [name, setName] = useState(user?.name || '');
  const [avatar, setAvatar] = useState(user?.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState('');

  const photoRef = useRef();

  const uploadPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSaving(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/auth/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setAvatar(res.data.avatar_url);
      setUser({ ...user, avatar_url: res.data.avatar_url });
      setOk('Photo updated!');
      setTimeout(() => setOk(''), 3000);
    } catch { alert("Failed to upload photo"); }
    setSaving(false);
  };

  const generateAI = async () => {
    if (!user.is_premium) {
      alert("💎 AI Avatar Stylist is a premium feature!");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/auth/avatar/generate');
      setAvatar(res.data.avatar_url);
      setUser({ ...user, avatar_url: res.data.avatar_url });
      setOk('AI Stylized your face! ✨');
      setTimeout(() => setOk(''), 3000);
    } catch (e) { alert(e.response?.data?.detail || "Upload a photo first."); }
    setSaving(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put('/auth/me', { name });
      setUser(res.data);
      setOk('Saved!');
      setTimeout(() => setOk(''), 3000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="page">
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '20px 20px 24px', borderRadius: '24px', padding: '16px 20px' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12 }}>← Back</button>
        <span className="header-title" style={{ color: 'var(--text)' }}>Profile</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 480, padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32, position: 'relative' }}>
          <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 16px' }}>
            <div className="avatar" style={{ 
              width: '100%', height: '100%', fontSize: '3rem', 
              background: 'linear-gradient(135deg, var(--accent), var(--purple))',
              border: avatar?.includes('ai_stylized') ? '3px solid var(--accent)' : 'none', 
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)' 
            }}>
              {avatar ? <img src={avatar} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : name?.[0]?.toUpperCase()}
            </div>
            <button onClick={() => photoRef.current.click()} style={{ position: 'absolute', bottom: 5, right: 5, width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', border: '3px solid var(--bg)', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>📷</button>
            <input type="file" ref={photoRef} style={{ display: 'none' }} onChange={uploadPhoto} />
          </div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#fff' }}>{user?.email}</p>
          {avatar && !avatar.includes('ai_stylized') && (
            <button onClick={generateAI} style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 700, marginTop: 12, cursor: 'pointer', padding: '6px 14px', borderRadius: 12 }}>
              ✨ AI STYLIZE AVATAR
            </button>
          )}
        </div>
        {ok && <div className="alert alert-s" style={{ marginBottom: 20 }}>{ok}</div>}
        <div className="card" style={{ padding: 24, borderRadius: 24, background: 'rgba(255,255,255,0.03)' }}>
          <div className="inp-wrap" style={{ marginBottom: 24 }}>
            <label style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 8, display: 'block' }}>Display Name</label>
            <input className="inp" value={name} onChange={e => setName(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14 }} />
          </div>
          <button className="btn btn-p btn-full" onClick={save} disabled={saving} style={{ padding: 16, borderRadius: 16, fontWeight: 700 }}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

function LegalSub({ title, content, onBack }) {
  const nav = useNavigate();
  const isPrivacy = title.toLowerCase().includes('privacy');
  const targetTab = isPrivacy ? 'privacy' : 'terms';

  return (
    <div className="page">
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '20px 20px 24px', borderRadius: '24px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12 }}>← Back</button>
        <span className="header-title" style={{ color: 'var(--text)' }}>{title}</span>
        <button
          className="btn btn-p"
          onClick={() => nav(`/legal?tab=${targetTab}`)}
          style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: 10 }}
        >
          Full Center ↗
        </button>
      </header>
      <div className="content" style={{ maxWidth: 640, padding: '0 24px', margin: '0 auto' }}>
        <div style={{
          background: 'rgba(201, 169, 110, 0.08)',
          border: '1px solid rgba(201, 169, 110, 0.25)',
          borderRadius: 16,
          padding: '14px 18px',
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}>
          <div>
            <strong style={{ fontSize: '0.88rem', color: 'var(--text)' }}>Certified Policy Overview</strong>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
              Compliant with DPDP Act 2023, GDPR, and CCPA standards.
            </p>
          </div>
          <button
            onClick={() => nav(`/legal?tab=${targetTab}`)}
            style={{
              background: 'var(--accent)',
              color: '#000',
              border: 'none',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Read Complete Doc
          </button>
        </div>

        {content.map((s, i) => (
          <div key={i} style={{ marginBottom: 24, background: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 20, border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--accent)', marginBottom: 10 }}>{s.heading}</h3>
            <p style={{ lineHeight: 1.7, fontSize: '0.9rem', color: 'var(--text)', opacity: 0.88, margin: 0 }}>{s.body}</p>
          </div>
        ))}

        <div style={{ textAlign: 'center', marginTop: 32, marginBottom: 20 }}>
          <button
            className="btn btn-g"
            onClick={() => nav(`/legal?tab=${targetTab}`)}
            style={{ padding: '12px 24px', borderRadius: 14, fontSize: '0.85rem' }}
          >
            View Official {title} in Legal Center ↗
          </button>
          <p style={{ fontSize: '0.75rem', opacity: 0.35, marginTop: 14 }}>Last updated: October 2026 • Version 2.4.0</p>
        </div>
      </div>
    </div>
  );
}

function AboutSub({ onBack }) {
  return (
    <div className="page">
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '20px 20px 24px', borderRadius: '24px', padding: '16px 20px' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12 }}>← Back</button>
        <span className="header-title" style={{ color: 'var(--text)' }}>About</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content center" style={{ maxWidth: 480, padding: '0 24px', textAlign: 'center' }}>
        <div style={{ width: 88, height: 88, borderRadius: 28, background: 'linear-gradient(135deg, var(--accent), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 24px', boxShadow: '0 15px 35px rgba(0,0,0,0.4)' }}>🔒</div>
        <h1 style={{ marginBottom: 8, fontSize: '2.2rem', fontWeight: 800 }}>Paxly</h1>
        <p style={{ color: 'var(--accent)', marginBottom: 36, fontWeight: 700, letterSpacing: 2 }}>RELATIONSHIP OPERATING SYSTEM</p>

        <div className="card" style={{ marginBottom: 16, textAlign: 'left', width: '100%', background: 'rgba(255,255,255,0.03)', padding: 22, borderRadius: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 10 }}>What is Paxly?</h3>
          <p style={{ lineHeight: 1.8, fontSize: '0.92rem', color: 'var(--muted)', margin: 0 }}>A private, encrypted sanctuary designed exclusively for couples. No ads, no public feeds, no distractions—just you, your partner, and your shared world.</p>
        </div>

        <div className="card" style={{ textAlign: 'left', width: '100%', background: 'rgba(255,255,255,0.03)', padding: 22, borderRadius: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 10 }}>Built with ❤️</h3>
          <p style={{ lineHeight: 1.8, fontSize: '0.92rem', color: 'var(--muted)', margin: 0 }}>React · FastAPI · PostgreSQL (Supabase)<br />Zero-knowledge client-side encryption and certified cloud architecture.</p>
        </div>

        <p style={{ marginTop: 40, fontSize: '0.75rem', opacity: 0.35 }}>© 2026 Paxly • Intimacy Protected Forever</p>
      </div>
    </div>
  );
}
