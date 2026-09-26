import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Icons } from '../../components/ui/Icons';

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

export default function SettingsDemo() {
  const { user, logoutUser, setUser } = useAuth();
  const nav = useNavigate();
  const [sub, setSub] = useState(null);

  const logout = () => { logoutUser(); nav('/'); };

  if (sub === 'profile')      return <ProfileSub user={user} setUser={setUser} onBack={() => setSub(null)} />;
  if (sub === 'security')     return <SecuritySub user={user} onBack={() => setSub(null)} />;
  if (sub === 'privacy')      return <PrivacySub user={user} setUser={setUser} onBack={() => setSub(null)} />;
  if (sub === 'relationship') return <RelationshipSub user={user} setUser={setUser} onBack={() => setSub(null)} />;
  if (sub === 'terms')        return <LegalSub title="Terms & Conditions" content={TERMS} onBack={() => setSub(null)} />;
  if (sub === 'privacy-policy') return <LegalSub title="Privacy Policy" content={PRIVACY} onBack={() => setSub(null)} />;
  if (sub === 'about')        return <AboutSub onBack={() => setSub(null)} />;
  if (sub === 'closure')      return <ClosureSub onBack={() => setSub(null)} onRequested={logout} />;

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
          <span className="header-title" style={{ color: 'var(--text)' }}>Settings (Demo)</span>
        </div>
        <div style={{ width: 24 }} />
      </header>

      <div className="content" style={{ maxWidth: 560, padding: '0 20px' }}>
        <Category title="Account">
          <SettingRow icon={<Icons.User size={20} />} title="Profile Details" desc="Name and basic info" onClick={() => setSub('profile')} />
          <Divider />
          <SettingRow icon={<Icons.Lock size={20} />} title="Security" desc="Password, App PIN, Security Q&A" onClick={() => setSub('security')} />
        </Category>

        <Category title="Privacy & Peace">
          <SettingRow icon={<Icons.Shield size={20} />} title="Privacy Settings" desc="Stealth Mode, Media Blur, Activity" onClick={() => setSub('privacy')} />
        </Category>

        <Category title="Relationship Intelligence">
          <SettingRow icon={<Icons.Aura size={20} />} title="AI & Milestones" desc="Aura AI tone, Relationship alerts" onClick={() => setSub('relationship')} />
        </Category>

        <Category title="Information">
          <SettingRow icon={<Icons.FileText size={20} />} title="Terms & Conditions" onClick={() => setSub('terms')} />
          <Divider />
          <SettingRow icon={<Icons.Shield size={20} />} title="Privacy Policy" onClick={() => setSub('privacy-policy')} />
          <Divider />
          <SettingRow icon={<Icons.Info size={20} />} title="About Vlynxly" onClick={() => setSub('about')} />
        </Category>

        <Category title="App Closure">
          <SettingRow icon={<Icons.LogOut size={20} />} title="Log Out" titleColor="var(--muted)" onClick={logout} />
          <Divider />
          <SettingRow icon={<Icons.AlertCircle size={20} />} title="Request Account Closure" titleColor="var(--danger)" desc="Free your ID while preserving memories" onClick={() => setSub('closure')} />
        </Category>
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
  if (sub === 'question') return <SecurityQuestionSub onBack={() => setSub(null)} />;

  const updatePin = async () => {
    try {
      await api.post('/security/pin/set', { pin });
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
          <Divider />
          <SettingRow icon={<Icons.Shield size={20} />} title="Security Question" desc="For recovering a forgotten App PIN" onClick={() => setSub('question')} />
        </Category>
        
        <Category title="Surveillance">
          <SettingRow icon={<Icons.Camera size={20} />} title="Intruder Selfie Logs" desc="Photos of failed unlock attempts" onClick={() => setSub('logs')} />
        </Category>
      </div>
    </div>
  );
}

function SecurityQuestionSub({ onBack }) {
  const [question, setQuestion] = useState('What city did you and your partner meet in?');
  const [answer, setAnswer] = useState('');
  const [ok, setOk] = useState('');

  const questions = [
    "What city did you and your partner meet in?",
    "What was the name of your first pet?",
    "What is your mother's maiden name?",
    "What was the name of your elementary school?",
    "What is your partner's exact birth time?"
  ];

  const save = async () => {
    try {
      await api.post('/security/pin/question/set', { question, answer });
      setOk('Security Question Saved!');
      setAnswer('');
      setTimeout(() => setOk(''), 3000);
    } catch (e) { alert(e.response?.data?.detail || 'Error saving question.'); }
  };

  return (
    <div className="page">
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '20px 20px 24px', borderRadius: '24px', padding: '16px 20px' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12 }}>← Back</button>
        <span className="header-title" style={{ color: 'var(--text)' }}>Security Question</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 440, padding: '0 20px' }}>
        {ok && <div className="alert alert-s" style={{ marginBottom: 20 }}>{ok}</div>}
        <div className="card" style={{ padding: 24, borderRadius: 24, background: 'rgba(255,255,255,0.03)' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>
            Set a security question. If you ever forget your App PIN, you can use this to regain access.
          </p>
          <div className="inp-wrap" style={{ marginBottom: 16 }}>
            <label style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 8, display: 'block' }}>Choose a Question</label>
            <select className="inp" value={question} onChange={e => setQuestion(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 14, color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
              {questions.map((q, i) => <option key={i} value={q} style={{ color: '#000' }}>{q}</option>)}
            </select>
          </div>
          <div className="inp-wrap" style={{ marginBottom: 24 }}>
            <label style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 8, display: 'block' }}>Your Answer</label>
            <input type="text" className="inp" value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type securely..." style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14 }} />
          </div>
          <button className="btn btn-p btn-full" onClick={save} disabled={!answer} style={{ padding: 16, borderRadius: 16, fontWeight: 600 }}>Save Question</button>
        </div>
      </div>
    </div>
  );
}

function PasswordSub({ onBack }) { return <div />; }
function IntruderLogsSub({ onBack }) { return <div />; }
function PrivacySub({ user, setUser, onBack }) { return <div />; }
function RelationshipSub({ user, setUser, onBack }) { return <div />; }
function ClosureSub({ onBack, onRequested }) { return <div />; }
function ProfileSub({ user, setUser, onBack }) { return <div />; }
function LegalSub({ title, content, onBack }) { return <div />; }
function AboutSub({ onBack }) { return <div />; }
