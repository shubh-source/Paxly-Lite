import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';

// --- LEGAL CONTENT ---
const TERMS = [
  { heading: '1. Acceptance of Terms', body: 'By using Vlynxly, you agree to these Terms and Conditions. If you do not agree, please do not use the app.' },
  { heading: '2. Account Responsibility', body: 'You are responsible for maintaining the security of your account. You must not share your credentials with anyone other than your connected partner.' },
  { heading: '3. Acceptable Use', body: 'Vlynxly is intended for use by consenting adults in a romantic relationship. You agree not to use the app for any illegal, harmful, or abusive purposes.' },
  { heading: '4. Memory Preservation (Eternity Clause)', body: 'Vlynxly is built to preserve memories. We do not automatically delete data. Even if an account is closed, shared history remains eternally stored to protect your joint history in case of reconciliation.' },
  { heading: '5. Non-Purge Policy', body: 'Unlike ephemeral apps, Vlynxly records are permanent. We do not support the deletion of memories, as we believe today\'s conflict should not erase yesterday\'s joy.' }
];

const PRIVACY = [
  { heading: 'Our Commitment', body: 'Vlynxly is built privacy-first. We collect the minimum data necessary to provide our service and never sell your data.' },
  { heading: 'Memory Archiving', body: 'Unlike other apps, we never purge your chat or media history. We believe relationship memories are precious and should be preserved forever, even after breakups, in case you reconcile later.' },
  { heading: 'Data Security', body: 'All data is encrypted in transit using TLS/HTTPS. Sensitive media is stored with encryption at rest.' },
  { heading: 'Your Rights', body: 'You can export your data at any time. You can request account closure, which frees your email for a new account while safeguarding your old memories in our vault.' },
];

export default function Settings() {
  const { user, logoutUser, setUser } = useAuth();
  const nav = useNavigate();
  const [sub, setSub] = useState(null); // 'profile' | 'security' | 'privacy' | 'relationship' | 'terms' | 'privacy-policy' | 'about' | 'closure'

  const logout = () => { logoutUser(); nav('/'); };

  // Router for sub-views
  if (sub === 'profile')      return <ProfileSub user={user} setUser={setUser} onBack={() => setSub(null)} />;
  if (sub === 'security')     return <SecuritySub user={user} onBack={() => setSub(null)} />;
  if (sub === 'privacy')      return <PrivacySub user={user} setUser={setUser} onBack={() => setSub(null)} />;
  if (sub === 'relationship') return <RelationshipSub user={user} setUser={setUser} onBack={() => setSub(null)} />;
  if (sub === 'terms')        return <LegalSub title="Terms & Conditions" content={TERMS} onBack={() => setSub(null)} />;
  if (sub === 'privacy-policy') return <LegalSub title="Privacy Policy" content={PRIVACY} onBack={() => setSub(null)} />;
  if (sub === 'about')        return <AboutSub onBack={() => setSub(null)} />;
  if (sub === 'closure')      return <ClosureSub onBack={() => setSub(null)} onRequested={logout} />;

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <header className="header" style={{ margin: '12px 20px', borderRadius: '16px' }}>
        <Link to="/dashboard" style={{ color: 'var(--muted)' }}>←</Link>
        <span className="header-title">Settings & Privacy</span>
        <div style={{ width: 24 }} />
      </header>

      <div className="content" style={{ maxWidth: 560 }}>
        {/* Profile Card */}
        <div className="card card-hover" onClick={() => setSub('profile')}
          style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, cursor: 'pointer', padding: '16px 18px' }}>
          <div className="avatar" style={{ width: 52, height: 52, fontSize: '1.2rem', flexShrink: 0 }}>
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)', marginBottom: 2 }}>{user?.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{user?.email}</div>
          </div>
          <span style={{ color: 'var(--muted)' }}>›</span>
        </div>

        {/* Categories */}
        <Category title="Account">
          <SettingRow icon="👤" title="Profile Details" desc="Name and basic info" onClick={() => setSub('profile')} />
          <Divider />
          <SettingRow icon="🛡️" title="Security" desc="Password, App PIN, Intruder Logs" onClick={() => setSub('security')} />
        </Category>

        <Category title="Privacy & Peace">
          <SettingRow icon="🔒" title="Privacy Settings" desc="Stealth Mode, Media Blur, Activity" onClick={() => setSub('privacy')} />
        </Category>

        <Category title="Relationship Intelligence">
          <SettingRow icon="✨" title="AI & Milestones" desc="AI Advisor tone, Relationship alerts" onClick={() => setSub('relationship')} />
          <Divider />
          <SettingRow icon="💾" title="Export Memories" desc="Download your digital scrapbook" onClick={async () => {
             const res = await axios.get('/api/auth/export');
             const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
             const url = window.URL.createObjectURL(blob);
             const a = document.createElement('a');
             a.href = url; a.download = 'vlynxly_history.json'; a.click();
          }} />
        </Category>

        <Category title="Information">
          <SettingRow icon="📄" title="Terms & Conditions" onClick={() => setSub('terms')} />
          <Divider />
          <SettingRow icon="🔐" title="Privacy Policy" onClick={() => setSub('privacy-policy')} />
          <Divider />
          <SettingRow icon="ℹ️" title="About Vlynxly" onClick={() => setSub('about')} />
        </Category>

        <Category title="App Closure">
          <SettingRow icon="🚪" title="Log Out" titleColor="var(--muted)" onClick={logout} />
          <Divider />
          <SettingRow icon="⌛" title="Request Account Closure" titleColor="var(--danger)" desc="Free your ID while preserving memories" onClick={() => setSub('closure')} />
        </Category>

        <p style={{ textAlign: 'center', fontSize: '0.72rem', opacity: 0.35, marginTop: 16 }}>
          Vlynxly v1.5.0 Premium · Memories Protected Forever
        </p>
      </div>
    </div>
  );
}

// --- SHARED COMPONENTS ---
function Category({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ fontSize: '0.75rem', letterSpacing: '0.12em', color: 'var(--accent)', fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', opacity: 0.8 }}>{title}</p>
      <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>{children}</div>
    </div>
  );
}

function SettingRow({ icon, title, desc, onClick, right, titleColor }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: onClick ? 'pointer' : 'default', transition: 'background 0.15s' }}
      onMouseEnter={e => onClick && (e.currentTarget.style.background = 'var(--s2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <span style={{ fontSize: '1.2rem', width: 28 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: '0.9rem', color: titleColor || 'var(--text)', marginBottom: desc ? 2 : 0 }}>{title}</div>
        {desc && <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{desc}</div>}
      </div>
      {right ? right : onClick ? <span style={{ color: 'var(--muted)', fontSize: '1rem' }}>›</span> : null}
    </div>
  );
}

function Divider() { return <div style={{ height: 1, background: 'var(--border)', marginLeft: 58 }} />; }

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, background: value ? 'var(--accent)' : 'var(--s3)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: value ? 'var(--bg)' : 'var(--muted)', transition: 'left 0.2s' }} />
    </div>
  );
}

// --- SUB-VIEWS ---

function SecuritySub({ user, onBack }) {
  const [sub, setSub] = useState(null); // 'password' | 'pin' | 'logs'
  const [pin, setPin] = useState('');
  const [pinOk, setPinOk] = useState(false);

  if (sub === 'password') return <PasswordSub onBack={() => setSub(null)} />;
  if (sub === 'logs') return <IntruderLogsSub onBack={() => setSub(null)} />;

  const updatePin = async () => {
    try {
      await axios.post('/api/security/pin/set', { pin });
      setPinOk(true);
      setTimeout(() => setPinOk(false), 2000);
    } catch { alert('PIN must be 4-6 digits.'); }
  };

  return (
    <div className="page">
      <header className="header">
        <button className="btn btn-g" onClick={onBack}>← Back</button>
        <span className="header-title">Security Settings</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 480 }}>
        <Category title="Access Control">
          <SettingRow icon="🔑" title="Change Password" desc="Account login password" onClick={() => setSub('password')} />
          <Divider />
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <p style={{ margin: 0, color: 'var(--text)', fontWeight: 500 }}>App PIN</p>
                <p style={{ margin: 0, fontSize: '0.75rem' }}>4-6 digit numeric lock</p>
              </div>
              {pinOk && <span style={{ color: 'var(--success)', fontSize: '0.75rem' }}>Updated!</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="password" className="inp" placeholder="New PIN" value={pin} onChange={e => setPin(e.target.value)} maxLength={6} style={{ flex: 1 }} />
              <button className="btn btn-p" onClick={updatePin} disabled={!pin}>Save</button>
            </div>
          </div>
        </Category>
        
        <Category title="Surveillance">
          <SettingRow icon="📸" title="Intruder Selfie Logs" desc="Photos of failed unlock attempts" onClick={() => setSub('logs')} />
          <Divider />
          <SettingRow icon="⏱️" title="Auto-Lock Timer" desc="Locks app after 20s of inactivity" right={<span style={{ color: 'var(--accent)', fontWeight: 600 }}>20s</span>} />
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
      await axios.post('/api/auth/password', { current_password: cur, new_password: next });
      setOk('Password updated!');
      setCur(''); setNext('');
    } catch (e) { alert(e.response?.data?.detail || 'Error updating password.'); }
  };

  return (
    <div className="page">
      <header className="header">
        <button className="btn btn-g" onClick={onBack}>← Back</button>
        <span className="header-title">Change Password</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 400 }}>
        {ok && <div className="alert alert-s">{ok}</div>}
        <div className="card">
          <div className="inp-wrap"><label>Current Password</label><input type="password" className="inp" value={cur} onChange={e => setCur(e.target.value)} /></div>
          <div className="inp-wrap"><label>New Password</label><input type="password" className="inp" value={next} onChange={e => setNext(e.target.value)} /></div>
          <button className="btn btn-p btn-full" onClick={save} disabled={!cur || !next}>Change Password</button>
        </div>
      </div>
    </div>
  );
}

function IntruderLogsSub({ onBack }) {
  const [logs, setLogs] = useState([]);
  useEffect(() => { axios.get('/api/security/intruder/logs').then(r => setLogs(r.data)); }, []);

  return (
    <div className="page">
      <header className="header">
        <button className="btn btn-g" onClick={onBack}>← Back</button>
        <span className="header-title">Intruder Selfie Logs</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 500 }}>
        <p style={{ textAlign: 'center', marginBottom: 20, fontSize: '0.85rem' }}>These are photos of anyone who tried to crack your App PIN.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {logs.map(log => (
            <div key={log.id} className="card" style={{ padding: 8 }}>
              <img src={log.photo_url} style={{ width: '100%', borderRadius: 8, aspectRatio: '3/4', objectFit: 'cover', marginBottom: 8 }} />
              <p style={{ margin: 0, textAlign: 'center', fontSize: '0.7rem' }}>{new Date(log.timestamp).toLocaleString()}</p>
            </div>
          ))}
          {logs.length === 0 && <p style={{ gridColumn: 'span 2', textAlign: 'center', opacity: 0.5, marginTop: 40 }}>No intruder logs found.</p>}
        </div>
      </div>
    </div>
  );
}

function PrivacySub({ user, setUser, onBack }) {
  const update = async (key, val) => {
    await axios.patch('/api/security/preferences', { [key]: val });
    setUser({ ...user, [key]: val });
  };

  // Stealth Mode logic
  useEffect(() => {
    if (user?.stealth_mode) {
      document.title = "Notes";
      document.querySelector("link[rel~='icon']").href = "https://www.google.com/favicon.ico"; // Generic icon
    } else {
      document.title = "Vlynxly";
      document.querySelector("link[rel~='icon']").href = "/favicon.ico";
    }
  }, [user?.stealth_mode]);

  return (
    <div className="page">
      <header className="header">
        <button className="btn btn-g" onClick={onBack}>← Back</button>
        <span className="header-title">Privacy Fortress</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 500 }}>
        <Category title="Visual Privacy">
          <SettingRow icon="🎭" title="Stealth Mode" desc="Disguises app title & icon as 'Notes'" 
            right={<Toggle value={user?.stealth_mode} onChange={v => update('stealth_mode', v)} />} />
          <Divider />
          <SettingRow icon="🌫️" title="Media Blurring" desc="Blur images in chat until tapped" 
            right={<Toggle value={user?.blur_sensitive} onChange={v => update('blur_sensitive', v)} />} />
        </Category>

        <Category title="Identity Privacy">
          <SettingRow icon="👻" title="Private Presence" desc="Hide when you are online or typing" 
            right={<Toggle value={user?.hide_activity} onChange={v => update('hide_activity', v)} />} />
        </Category>
      </div>
    </div>
  );
}

function RelationshipSub({ user, setUser, onBack }) {
  const update = async (key, val) => {
    await axios.patch('/api/security/preferences', { [key]: val });
    setUser({ ...user, [key]: val });
  };

  const tones = [
    { id: 'compassionate', label: 'Compassionate' },
    { id: 'professional',  label: 'Professional' },
    { id: 'friend',        label: 'Best Friend' },
  ];

  return (
    <div className="page">
      <header className="header">
        <button className="btn btn-g" onClick={onBack}>← Back</button>
        <span className="header-title">Relationship Intelligence</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 500 }}>
        <Category title="AI Advisor Tone">
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tones.map(t => (
              <div key={t.id} onClick={() => update('ai_personality', t.id)}
                style={{ padding: '12px 14px', borderRadius: 12, background: user?.ai_personality === t.id ? 'rgba(201,169,110,0.1)' : 'var(--s2)', border: '1px solid', borderColor: user?.ai_personality === t.id ? 'var(--accent)' : 'transparent', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 500 }}>{t.label}</span>
                {user?.ai_personality === t.id && <span>✓</span>}
              </div>
            ))}
          </div>
        </Category>

        <Category title="Engagement">
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
      await axios.post('/api/auth/request-closure');
      setOk(true);
    } catch { alert('Error submitting request.'); }
    setLoading(false);
  };

  if (ok) return (
    <div className="page center" style={{ padding: 40 }}>
      <div style={{ fontSize: '3rem', marginBottom: 20 }}>🕊️</div>
      <h2>Request Submitted</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 40 }}>A Vlynxly Relationship Executive will contact both you and your partner shortly to confirm the closure. Your shared memories and history are now protected in our vault and will **never** be deleted.</p>
      <button className="btn btn-p btn-full" onClick={onRequested}>Log Out Pending Review</button>
    </div>
  );

  return (
    <div className="page">
      <header className="header">
        <button className="btn btn-g" onClick={onBack}>← Back</button>
        <span className="header-title">Account Closure</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content center" style={{ maxWidth: 440 }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>⚠️</div>
        <h2 style={{ color: 'var(--danger)', marginBottom: 8 }}>Closure Request</h2>
        <p style={{ marginBottom: 32, lineHeight: 1.8 }}>We understand this may be a difficult time. Requesting closure allows you to free your account ID for a new start, while **preserving all your joint history forever** in our secure vault.</p>

        <div className="card" style={{ marginBottom: 32, textAlign: 'left', borderColor: 'rgba(201,169,110,0.3)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>Vlynxly's Guarantee:</h3>
          {['Your shared history will NEVER be deleted', 'Every message and photo is preserved', 'Your ID will be freed after executive review', 'Memories are safe if you ever reconcile'].map((g, i) => (
            <p key={i} style={{ fontSize: '0.82rem', marginBottom: 6, color: 'var(--accent)' }}>✓ {g}</p>
          ))}
        </div>

        <button className="btn btn-d btn-full" onClick={request} disabled={loading}>{loading ? 'Submitting...' : 'Confirm Closure Request'}</button>
        <p style={{ marginTop: 16, fontSize: '0.75rem', color: 'var(--muted)' }}>An executive will contact both partners within 24-48 hours.</p>
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
      const res = await axios.post('/api/auth/avatar', formData);
      setAvatar(res.data.avatar_url);
      setUser({ ...user, avatar_url: res.data.avatar_url });
      setOk('Photo updated!');
    } catch {}
    setSaving(false);
  };

  const generateAI = async () => {
    if (!user.is_premium) {
      alert("💎 AI Avatar Stylist is a premium feature!");
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post('/api/auth/avatar/generate');
      setAvatar(res.data.avatar_url);
      setUser({ ...user, avatar_url: res.data.avatar_url });
      setOk('AI Stylized your face! ✨');
    } catch (e) { alert(e.response?.data?.detail || "Upload a photo first."); }
    setSaving(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await axios.put('/api/auth/me', { name });
      setUser(res.data);
      setOk('Saved!');
      setTimeout(() => setOk(''), 2500);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="page">
      <header className="header">
        <button className="btn btn-g" onClick={onBack}>← Back</button>
        <span className="header-title">Edit Profile</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 28, position: 'relative' }}>
          <div style={{ position: 'relative', width: 92, height: 92, margin: '0 auto 12px' }}>
            <div className="avatar" style={{ width: '100%', height: '100%', fontSize: '2.5rem', border: avatar?.includes('ai_stylized') ? '2px solid var(--accent)' : 'none', boxShadow: avatar?.includes('ai_stylized') ? '0 0 15px var(--accent)' : 'none' }}>
              {avatar ? <img src={avatar} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : name?.[0]?.toUpperCase()}
            </div>
            <button onClick={() => photoRef.current.click()} style={{ position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg)', fontSize: '1rem', cursor: 'pointer' }}>📷</button>
            <input type="file" ref={photoRef} style={{ display: 'none' }} onChange={uploadPhoto} />
          </div>
          <p style={{ margin: 0, fontWeight: 600 }}>{user?.email}</p>
          {avatar && !avatar.includes('ai_stylized') && (
            <button onClick={generateAI} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600, marginTop: 8, cursor: 'pointer' }}>
              ✨ AI Stylize Avatar (Premium)
            </button>
          )}
        </div>
        {ok && <div className="alert alert-s" style={{ marginBottom: 16 }}>{ok}</div>}
        <div className="card">
          <div className="inp-wrap">
            <label>Display Name</label>
            <input className="inp" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <button className="btn btn-p btn-full" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

function LegalSub({ title, content, onBack }) {
  return (
    <div className="page">
      <header className="header">
        <button className="btn btn-g" onClick={onBack}>← Back</button>
        <span className="header-title">{title}</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 680 }}>
        {content.map((s, i) => (
          <div key={i} style={{ marginBottom: 24 }}>
            <h3 style={{ fontFamily: 'var(--font-b)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', marginBottom: 8 }}>{s.heading}</h3>
            <p style={{ lineHeight: 1.8, fontSize: '0.88rem' }}>{s.body}</p>
          </div>
        ))}
        <p style={{ textAlign: 'center', fontSize: '0.72rem', opacity: 0.35, marginTop: 16 }}>Last updated: March 2026</p>
      </div>
    </div>
  );
}

function AboutSub({ onBack }) {
  return (
    <div className="page">
      <header className="header">
        <button className="btn btn-g" onClick={onBack}>← Back</button>
        <span className="header-title">About Vlynxly</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content center" style={{ maxWidth: 480 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', border: '1px solid rgba(201,169,110,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', margin: '0 auto 20px' }}>🔒</div>
        <h1 style={{ marginBottom: 6 }}>Vlynxly</h1>
        <p style={{ color: 'var(--accent)', marginBottom: 32 }}>Version 1.5.0</p>

        <div className="card" style={{ marginBottom: 12, textAlign: 'left', width: '100%' }}>
          <h3 style={{ fontFamily: 'var(--font-b)', fontWeight: 600, fontSize: '0.9rem', marginBottom: 10 }}>What is Vlynxly?</h3>
          <p style={{ lineHeight: 1.8, fontSize: '0.88rem' }}>A private, encrypted space designed exclusively for couples. No ads, no feeds, no distractions — just you and your person.</p>
        </div>

        <div className="card" style={{ textAlign: 'left', width: '100%' }}>
          <h3 style={{ fontFamily: 'var(--font-b)', fontWeight: 600, fontSize: '0.9rem', marginBottom: 8 }}>Built with ❤️</h3>
          <p style={{ lineHeight: 1.8, fontSize: '0.88rem' }}>React · FastAPI · MongoDB<br />Design & Security focused.</p>
        </div>

        <p style={{ marginTop: 28, fontSize: '0.72rem', opacity: 0.35 }}>© 2026 Vlynxly · Memories Protected Forever</p>
      </div>
    </div>
  );
}
