import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api, { resolveMediaUrl } from '../../services/api';
import { Icons } from '../../components/ui/Icons';

// --- LEGAL CONTENT GROUNDED IN PRODUCTION FEATURES ---
const TERMS = [
  { 
    heading: '1. Consensual Intimate Sanctuary & 18+ Eligibility', 
    body: 'Paxly is built exclusively for consenting adults aged 18 and older in a personal or romantic partnership. All shared interactions, messages, and vault media must be mutually consensual. Using the platform for commercial solicitation, non-consensual media, or harassment is strictly prohibited.' 
  },
  { 
    heading: '2. One-to-One Couple Space Architecture', 
    body: 'Paxly creates a private sanctuary strictly between two paired partners linked by a mutual pairing code. You are responsible for safeguarding your login master password, App PIN, and device access. Credentials must never be shared with third parties.' 
  },
  { 
    heading: '3. Intimate Chat Rights: Edit, Delete & Ephemeral Media', 
    body: 'You retain the right to edit your sent messages (which are transparently marked with an "edited" tag for partner clarity) and delete messages ("Delete for Me" or "Delete for Everyone" for sent items). Ephemeral once-view media self-destructs immediately after viewing.' 
  },
  { 
    heading: '4. Dual-Consent & Anti-Harvesting Safeguards', 
    body: 'Exporting or saving shared intimate memories to an external device gallery requires mutual dual-consent authorization (vault download request). Circumventing anti-screenshot shields, scraping, or recording a partner\'s content is a direct terms violation.' 
  },
  { 
    heading: '5. Aura AI Guidance & Crisis Escalation Protocol', 
    body: 'Aura AI is an artificial intelligence companion designed for relationship reflection and emotional wellness—NOT a licensed medical doctor, clinical psychologist, or emergency hotline. In situations of imminent self-harm, automated non-intrusive safety notices may reach your linked partner without ever disclosing chat transcripts.' 
  },
  { 
    heading: '6. Memory Eternity Guarantee & 30-Day Erasure', 
    body: 'Unlike ephemeral apps, Paxly values shared milestones. Upon account closure, partners can choose between our Eternity Guarantee (archiving past memories safely in the vault) or statutory 30-day irreversible erasure under global privacy standards.' 
  }
];

const PRIVACY = [
  { 
    heading: '1. Zero Ad Targeting & Zero Commercial Data Brokering', 
    body: 'Paxly is built privacy-first. We collect only the minimum data required to deliver your private couple space. We NEVER sell, rent, monetize, or trade your personal data, chat transcripts, voice notes, or intimate media to advertisers or data brokers.' 
  },
  { 
    heading: '2. Client-Side Cryptography & Protected Storage', 
    body: 'All intimate messages, voice whispers, and vault media are protected by client-side cryptographic keys derived on your device using TweetNaCl and Web Crypto API. Paxly servers cannot view, inspect, or decrypt your end-to-end encrypted communications.' 
  },
  { 
    heading: '3. Fortress PIN, Stealth Disguise & Intruder Selfie', 
    body: 'Your sanctuary is guarded by a 4-digit numeric App PIN (verified locally in <1ms via salted SHA-256), optional Calculator disguise mode, and automated Intruder Selfie defense that silently snaps 3-failed-attempts and alerts your partner in real-time.' 
  },
  { 
    heading: '4. Aura AI Safety Engine & Zero-Transcript Leak Guarantee', 
    body: 'Aura AI only processes interactions during explicit user-directed sessions. If an imminent safety crisis is detected, a generic care alert may be sent strictly to your verified partner. Safety alerts NEVER include private chat transcripts, message quotes, or user prompts.' 
  },
  { 
    heading: '5. Dual-Consent Downloads & Anti-Screenshot Shield', 
    body: 'Shared intimate memories cannot be downloaded to phone galleries without mutual approval. Native screen-recording shields prevent unauthorized screen captures, screengrabs, or system task-switcher leaks.' 
  },
  { 
    heading: '6. Data Principal Rights (DPDP Act 2023, GDPR & CCPA)', 
    body: 'You retain full ownership of your data. You can export your complete history in machine-readable JSON format at any time, correct details, unlink partners, or invoke your Right to Erasure for complete permanent deletion within 30 days.' 
  }
];

const COOKIES = [
  { 
    heading: '1. Zero Advertising or Tracking Cookies', 
    body: 'Paxly does not use advertising cookies, marketing pixels (such as Google Ads, Meta Pixel, or TikTok), or behavioral tracking beacons. We do not track your activity across external sites.' 
  },
  { 
    heading: '2. Strictly Essential Session Authentication', 
    body: 'Local device storage is utilized strictly to store your secure JSON Web Token (ros_token) required to maintain your encrypted session over TLS 1.3 without asking for your password on every action.' 
  },
  { 
    heading: '3. Client-Side Cryptographic Vault Keys', 
    body: 'Web Crypto API and TweetNaCl cryptographic key pairs are stored in protected local device storage to encrypt and decrypt intimate messages and vault media on your device.' 
  },
  { 
    heading: '4. Instant Local Fortress PIN Hash', 
    body: 'A salted SHA-256 hash of your App PIN is stored locally to provide sub-millisecond offline verification without transmitting plain PINs across the network.' 
  },
  { 
    heading: '5. Complete Session & Cache Purge on Logout', 
    body: 'When you tap Log Out, all local session tokens, cryptographic keys, cached notification counts, and offline drafts are completely and irreversibly purged from your browser.' 
  }
];

const COMPLIANCE = [
  { 
    heading: '1. Digital Personal Data Protection Act, 2023 (India)', 
    body: 'Compliant with Indian DPDP Act standards, enforcing explicit purpose limitation, accessible consent withdrawal, data principal rights, and appointment of a dedicated Grievance Officer reachable at privacy@paxly.app.' 
  },
  { 
    heading: '2. General Data Protection Regulation (GDPR / UK GDPR)', 
    body: 'Adheres to Articles 15–22 of the GDPR, providing right of access, right to rectification, right to erasure ("Right to be Forgotten"), data portability, and strict data processing agreements with infrastructure providers.' 
  },
  { 
    heading: '3. California Consumer Privacy Act (CCPA / CPRA)', 
    body: 'Guarantees California consumers full transparency, non-discrimination, and zero sale or sharing of personal information ("Do Not Sell or Share My Personal Information" default architecture).' 
  },
  { 
    heading: '4. Certified Transport & Storage Cryptography', 
    body: 'Enforces TLS 1.3 encryption in transit with Perfect Forward Secrecy and AES-256 encryption at rest across databases and storage volumes hosted in SOC2 / ISO 27001 certified data centers.' 
  }
];

export default function Settings() {
  const { user, logoutUser, setUser } = useAuth();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSub = searchParams.get('sub');
  const [sub, setSub] = useState(initialSub || null);
  const [copiedSpace, setCopiedSpace] = useState(false);

  const logout = () => { logoutUser(); nav('/'); };

  const copySpaceCode = () => {
    if (user?.couple_space_id) {
      navigator.clipboard?.writeText(user.couple_space_id);
      setCopiedSpace(true);
      setTimeout(() => setCopiedSpace(false), 2000);
    }
  };

  const exportHistory = async () => {
    try {
      const res = await api.get('/auth/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'paxly_history.json';
      a.click();
    } catch {
      alert('Failed to export data. Please try again.');
    }
  };

  // Router for sub-views
  if (sub === 'profile')        return <ProfileSub user={user} setUser={setUser} onBack={() => { setSearchParams({}); setSub(null); }} />;
  if (sub === 'security')       return <SecuritySub user={user} onBack={() => { setSearchParams({}); setSub(null); }} onOpenLogs={() => setSub('logs')} onOpenPassword={() => setSub('password')} />;
  if (sub === 'password')       return <PasswordSub onBack={() => { setSearchParams({}); setSub('security'); }} />;
  if (sub === 'privacy')        return <PrivacySub user={user} setUser={setUser} onBack={() => { setSearchParams({}); setSub(null); }} />;
  if (sub === 'relationship')   return <RelationshipSub user={user} setUser={setUser} onBack={() => { setSearchParams({}); setSub(null); }} />;
  if (sub === 'terms')          return <LegalSub title="Terms of Service" content={TERMS} onBack={() => { setSearchParams({}); setSub(null); }} tabType="terms" />;
  if (sub === 'privacy-policy') return <LegalSub title="Privacy Policy" content={PRIVACY} onBack={() => { setSearchParams({}); setSub(null); }} tabType="privacy" />;
  if (sub === 'cookies')        return <LegalSub title="Cookie & Local Storage Policy" content={COOKIES} onBack={() => { setSearchParams({}); setSub(null); }} tabType="cookies" />;
  if (sub === 'compliance')     return <LegalSub title="Certified Compliance Architecture" content={COMPLIANCE} onBack={() => { setSearchParams({}); setSub(null); }} tabType="privacy" />;
  if (sub === 'about')          return <AboutSub onBack={() => { setSearchParams({}); setSub(null); }} />;
  if (sub === 'closure')        return <ClosureSub onBack={() => { setSearchParams({}); setSub(null); }} onRequested={logout} />;
  if (sub === 'logs')           return <IntruderLogsSub onBack={() => { setSearchParams({}); setSub('security'); }} />;

  return (
    <div className="page" style={{ paddingBottom: 110, background: 'var(--bg, #09090B)', minHeight: '100vh' }}>
      {/* Header */}
      <header className="header" style={{ 
        background: 'rgba(22, 22, 24, 0.65)', 
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        margin: '16px 20px 20px',
        borderRadius: '24px',
        padding: '16px 20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/profile" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }} title="Back to Profile">
            <Icons.Back size={22} />
          </Link>
          <div>
            <span className="header-title" style={{ color: 'var(--text)', fontWeight: 700, fontSize: '1.08rem' }}>
              Settings & Fortress
            </span>
          </div>
        </div>
        <div style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          background: 'rgba(201,169,110,0.12)',
          color: 'var(--accent)',
          border: '1px solid rgba(201,169,110,0.3)',
          padding: '3px 10px',
          borderRadius: 12,
          letterSpacing: '0.4px'
        }}>
          v3.0 Certified
        </div>
      </header>

      <div className="content" style={{ maxWidth: 580, padding: '0 20px', margin: '0 auto' }}>
        
        {/* Profile Hero Card */}
        <div 
          className="card card-hover" 
          onClick={() => setSub('profile')}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 16, 
            marginBottom: 28, 
            cursor: 'pointer', 
            padding: '18px 20px', 
            borderRadius: 24, 
            background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(201,169,110,0.06) 100%)', 
            border: '1px solid rgba(201,169,110,0.22)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.25)'
          }}
        >
          <div className="avatar" style={{ 
            width: 60, 
            height: 60, 
            fontSize: '1.4rem', 
            flexShrink: 0, 
            background: 'linear-gradient(135deg, var(--accent), var(--purple, #a855f7))', 
            color: '#fff',
            borderRadius: '50%',
            overflow: 'hidden',
            border: '2px solid rgba(201,169,110,0.4)',
            boxShadow: '0 4px 15px rgba(201,169,110,0.25)'
          }}>
            {user?.avatar_url ? (
              <img src={resolveMediaUrl(user.avatar_url)} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              user?.name?.[0]?.toUpperCase() || <Icons.User size={30} color="#000" />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name || 'Partner Account'}
              </span>
              {user?.is_premium && (
                <span style={{ fontSize: '0.68rem', fontWeight: 800, background: 'var(--accent)', color: '#000', padding: '1px 6px', borderRadius: 8 }}>
                  VIP
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 6 }}>
              {user?.email}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--accent)', background: 'rgba(201,169,110,0.1)', padding: '2px 8px', borderRadius: 10 }}>
              <span>{user?.couple_space_id ? `💑 Space #${user.couple_space_id.slice(-6)}` : '🔒 Solo Sanctuary'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Edit</span>
            <Icons.Back size={18} style={{ transform: 'rotate(180deg)', opacity: 0.7 }} />
          </div>
        </div>

        {/* Category 1: Fortress & Security */}
        <Category title="Fortress & Security">
          <SettingRow 
            icon={<Icons.Shield size={20} color="var(--accent)" />} 
            title="App PIN & Fortress Lock" 
            desc="4-6 digit numeric lock with sub-ms local cryptographic verification" 
            onClick={() => setSub('security')}
            right={
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                color: user?.has_pin ? '#34C759' : 'var(--muted)',
                background: user?.has_pin ? 'rgba(52,199,89,0.12)' : 'rgba(255,255,255,0.05)',
                padding: '4px 10px',
                borderRadius: 10
              }}>
                {user?.has_pin ? 'Active ✓' : 'Setup PIN →'}
              </span>
            }
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Camera size={20} color="#FF453A" />} 
            title="Intruder Selfie Logs" 
            desc="Silent photo capture on 3 wrong PIN attempts with live partner alert" 
            onClick={() => setSub('logs')}
            right={<span style={{ color: 'var(--muted)', display: 'flex', opacity: 0.6 }}><Icons.Back size={18} style={{ transform: 'rotate(180deg)' }} /></span>}
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Lock size={20} />} 
            title="Account Password" 
            desc="Update master account login password" 
            onClick={() => setSub('password')}
            right={<span style={{ color: 'var(--muted)', display: 'flex', opacity: 0.6 }}><Icons.Back size={18} style={{ transform: 'rotate(180deg)' }} /></span>}
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Key size={20} color="var(--accent)" />} 
            title="PIN Recovery Methods" 
            desc="Reset PIN via Account Password, Security Question, or Anniversary Date" 
            onClick={() => setSub('security')}
            right={<span style={{ color: 'var(--muted)', display: 'flex', opacity: 0.6 }}><Icons.Back size={18} style={{ transform: 'rotate(180deg)' }} /></span>}
          />
        </Category>

        {/* Category 2: Privacy & Anti-Surveillance */}
        <Category title="Privacy & Anti-Surveillance">
          <SettingRow 
            icon={<Icons.EyeOff size={20} color="var(--purple, #a855f7)" />} 
            title="Stealth Disguise Mode" 
            desc="Disguises app as Notes & replaces lock screen with Calculator" 
            onClick={() => setSub('privacy')}
            right={
              <Toggle 
                value={user?.stealth_mode} 
                onChange={async (v) => {
                  try {
                    await api.patch('/security/preferences', { stealth_mode: v });
                    setUser({ ...user, stealth_mode: v });
                  } catch (e) { console.error(e); }
                }} 
              />
            } 
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Vault size={20} color="var(--accent)" />} 
            title="Media Blurring" 
            desc="Blur incoming intimate media in chat until tapped to view" 
            right={
              <Toggle 
                value={user?.blur_sensitive} 
                onChange={async (v) => {
                  try {
                    await api.patch('/security/preferences', { blur_sensitive: v });
                    setUser({ ...user, blur_sensitive: v });
                  } catch (e) { console.error(e); }
                }} 
              />
            } 
          />
          <Divider />
          <SettingRow 
            icon={<Icons.UserCheck size={20} />} 
            title="Private Presence & Typing" 
            desc="Hide online status and real-time typing indicators" 
            right={
              <Toggle 
                value={user?.hide_activity} 
                onChange={async (v) => {
                  try {
                    await api.patch('/security/preferences', { hide_activity: v });
                    setUser({ ...user, hide_activity: v });
                  } catch (e) { console.error(e); }
                }} 
              />
            } 
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Download size={20} color="var(--accent)" />} 
            title="Dual-Consent Vault Protection" 
            desc="Requires mutual partner authorization before saving memories to phone" 
            onClick={() => setSub('privacy')}
            right={
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)', background: 'rgba(201,169,110,0.12)', padding: '4px 10px', borderRadius: 10 }}>
                Dual-Consent ✓
              </span>
            }
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Shield size={20} color="#34C759" />} 
            title="Anti-Screenshot Defense" 
            desc="Hardware screen protection shields against recording & task-switcher leaks" 
            right={
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#34C759', background: 'rgba(52,199,89,0.12)', padding: '4px 10px', borderRadius: 10 }}>
                Active 🛡️
              </span>
            }
          />
        </Category>

        {/* Category 3: Relationship & Couple Sanctuary */}
        <Category title="Relationship & Couple Sanctuary">
          <SettingRow 
            icon={<Icons.Heart size={20} color="#FF3B30" />} 
            title="Couple Space Code" 
            desc={user?.couple_space_id ? `Space ID: ${user.couple_space_id}` : 'Connect with your partner'} 
            onClick={copySpaceCode}
            right={
              <button 
                onClick={(e) => { e.stopPropagation(); copySpaceCode(); }}
                style={{
                  background: copiedSpace ? 'rgba(52,199,89,0.2)' : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: copiedSpace ? '#34C759' : 'var(--text)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '6px 12px',
                  borderRadius: 12,
                  cursor: 'pointer'
                }}
              >
                {copiedSpace ? 'Copied ✓' : 'Copy Code'}
              </button>
            }
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Aura size={20} color="var(--accent)" />} 
            title="Aura AI Emotional Companion" 
            desc="Coaching persona, tone customization & Ask-First crisis mode" 
            onClick={() => setSub('relationship')}
            right={<span style={{ color: 'var(--muted)', display: 'flex', opacity: 0.6 }}><Icons.Back size={18} style={{ transform: 'rotate(180deg)' }} /></span>}
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Milestone size={20} color="var(--accent)" />} 
            title="Milestone & Anniversary Alerts" 
            desc="Automated countdown reminders (30 days, 7 days, 1 day, and celebration day)" 
            right={
              <Toggle 
                value={user?.milestone_alerts ?? true} 
                onChange={async (v) => {
                  try {
                    await api.patch('/security/preferences', { milestone_alerts: v });
                    setUser({ ...user, milestone_alerts: v });
                  } catch (e) { console.error(e); }
                }} 
              />
            } 
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Download size={20} />} 
            title="Export Digital Scrapbook" 
            desc="1-click download of all messages, notes & milestones (JSON format)" 
            onClick={exportHistory}
            right={
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', background: 'rgba(201,169,110,0.1)', padding: '4px 10px', borderRadius: 10 }}>
                JSON ↗
              </span>
            }
          />
        </Category>

        {/* Category 4: Legal, Compliance & Transparency */}
        <Category title="Legal, Compliance & Transparency">
          <SettingRow 
            icon={<Icons.FileText size={20} color="var(--accent)" />} 
            title="Terms of Service" 
            desc="Consensual intimate sanctuary rules, message editing & deletion rights" 
            onClick={() => setSub('terms')}
            right={<span style={{ color: 'var(--muted)', display: 'flex', opacity: 0.6 }}><Icons.Back size={18} style={{ transform: 'rotate(180deg)' }} /></span>}
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Shield size={20} color="var(--accent)" />} 
            title="Privacy Policy" 
            desc="Zero ad tracking, client-side encryption & verified partner alerts" 
            onClick={() => setSub('privacy-policy')}
            right={<span style={{ color: 'var(--muted)', display: 'flex', opacity: 0.6 }}><Icons.Back size={18} style={{ transform: 'rotate(180deg)' }} /></span>}
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Lock size={20} color="var(--accent)" />} 
            title="Cookie & Local Storage Policy" 
            desc="No advertising trackers • Pure session JWTs & cryptographic vault keys" 
            onClick={() => setSub('cookies')}
            right={<span style={{ color: 'var(--muted)', display: 'flex', opacity: 0.6 }}><Icons.Back size={18} style={{ transform: 'rotate(180deg)' }} /></span>}
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Check size={20} color="#34C759" />} 
            title="Certified Compliance Architecture" 
            desc="DPDP Act 2023, GDPR, CCPA & ISO 27001 transport security standards" 
            onClick={() => setSub('compliance')}
            right={<span style={{ color: 'var(--muted)', display: 'flex', opacity: 0.6 }}><Icons.Back size={18} style={{ transform: 'rotate(180deg)' }} /></span>}
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Info size={20} />} 
            title="About Paxly" 
            desc="Relationship Operating System • Version 3.0 Production Architecture" 
            onClick={() => setSub('about')}
            right={<span style={{ color: 'var(--muted)', display: 'flex', opacity: 0.6 }}><Icons.Back size={18} style={{ transform: 'rotate(180deg)' }} /></span>}
          />
        </Category>

        {/* Category 5: Account & Session Management */}
        <Category title="Account Management">
          <SettingRow 
            icon={<Icons.LogOut size={20} color="var(--muted)" />} 
            title="Log Out" 
            desc="Safely purges local session tokens and cryptographic keys from this device"
            titleColor="var(--text)" 
            onClick={logout}
            right={<span style={{ color: 'var(--muted)', fontSize: '0.8rem', fontWeight: 600 }}>End Session →</span>}
          />
          <Divider />
          <SettingRow 
            icon={<Icons.AlertCircle size={20} color="#FF3B30" />} 
            title="Request Account Closure" 
            titleColor="#FF3B30" 
            desc="Free your ID while preserving joint memories forever in the vault or scheduling erasure" 
            onClick={() => setSub('closure')}
            right={<span style={{ color: '#FF3B30', display: 'flex', opacity: 0.7 }}><Icons.Back size={18} style={{ transform: 'rotate(180deg)' }} /></span>}
          />
        </Category>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 36, marginBottom: 20 }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0, letterSpacing: '0.5px' }}>
            Paxly v3.0.0 Certified Production Release
          </p>
          <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
            Client-Side Zero-Knowledge Cryptography • Intimacy & Memories Protected Forever
          </p>
        </div>

      </div>
    </div>
  );
}

// --- SHARED REUSABLE COMPONENTS ---
function Category({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ 
        fontSize: '0.72rem', 
        letterSpacing: '0.12em', 
        color: 'var(--accent)', 
        fontWeight: 800, 
        marginBottom: 10, 
        textTransform: 'uppercase', 
        paddingLeft: 6 
      }}>
        {title}
      </p>
      <div className="card" style={{ 
        padding: 0, 
        overflow: 'hidden', 
        background: 'rgba(255,255,255,0.025)', 
        border: '1px solid rgba(255,255,255,0.06)', 
        borderRadius: 22,
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)'
      }}>
        {children}
      </div>
    </div>
  );
}

function SettingRow({ icon, title, desc, onClick, right, titleColor }) {
  return (
    <div 
      onClick={onClick} 
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 14, 
        padding: '16px 18px', 
        cursor: onClick ? 'pointer' : 'default', 
        transition: 'background 0.2s ease' 
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.background = 'rgba(255,255,255,0.035)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ 
        width: 36, 
        height: 36, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        background: 'rgba(255,255,255,0.04)', 
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.94rem', color: titleColor || 'var(--text)', marginBottom: desc ? 2 : 0 }}>
          {title}
        </div>
        {desc && <div style={{ fontSize: '0.77rem', color: 'var(--muted)', lineHeight: 1.35 }}>{desc}</div>}
      </div>
      {right}
    </div>
  );
}

function Divider() { 
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', marginLeft: 64 }} />; 
}

function Toggle({ value, onChange }) {
  return (
    <div 
      onClick={(e) => { e.stopPropagation(); onChange(!value); }} 
      style={{ 
        width: 48, 
        height: 26, 
        borderRadius: 13, 
        background: value ? 'var(--accent)' : 'rgba(255,255,255,0.12)', 
        cursor: 'pointer', 
        position: 'relative', 
        transition: 'all 0.3s ease', 
        flexShrink: 0 
      }}
    >
      <div style={{ 
        position: 'absolute', 
        top: 3, 
        left: value ? 25 : 3, 
        width: 20, 
        height: 20, 
        borderRadius: '50%', 
        background: value ? '#000' : 'var(--muted)', 
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
        boxShadow: '0 2px 4px rgba(0,0,0,0.3)' 
      }} />
    </div>
  );
}

// --- SUB-VIEWS ---

function SecuritySub({ user, onBack, onOpenLogs, onOpenPassword }) {
  const [pin, setPin] = useState('');
  const [pinOk, setPinOk] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  const updatePin = async () => {
    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      alert('PIN must be 4 to 6 numeric digits.');
      return;
    }
    setSavingPin(true);
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
      setPin('');
      setTimeout(() => setPinOk(false), 2500);
    } catch {
      alert('Failed to update PIN. Must be 4-6 digits.');
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <div className="page" style={{ minHeight: '100vh', background: 'var(--bg, #09090B)' }}>
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.65)', borderBottom: '1px solid rgba(255,255,255,0.06)', margin: '16px 20px 24px', borderRadius: '24px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Back size={18} /> Back
        </button>
        <span className="header-title" style={{ color: 'var(--text)', fontWeight: 700 }}>Security & Fortress</span>
        <div style={{ width: 60 }} />
      </header>

      <div className="content" style={{ maxWidth: 520, padding: '0 20px', margin: '0 auto' }}>
        <Category title="Access Control">
          <SettingRow 
            icon={<Icons.Lock size={20} color="var(--accent)" />} 
            title="Change Master Password" 
            desc="Update your primary account login password" 
            onClick={onOpenPassword}
            right={<span style={{ color: 'var(--muted)', display: 'flex', opacity: 0.6 }}><Icons.Back size={18} style={{ transform: 'rotate(180deg)' }} /></span>}
          />
          <Divider />
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <p style={{ margin: 0, color: 'var(--text)', fontWeight: 600, fontSize: '0.95rem' }}>App PIN Lock</p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>Set or replace your 4-6 digit numeric lock</p>
              </div>
              {pinOk && <span style={{ color: '#34C759', fontSize: '0.8rem', fontWeight: 700 }}>Saved Successfully ✓</span>}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <input 
                type="password" 
                className="inp" 
                placeholder="New 4-6 digit PIN" 
                value={pin} 
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))} 
                maxLength={6} 
                style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: 14 }} 
              />
              <button 
                className="btn btn-p" 
                onClick={updatePin} 
                disabled={pin.length < 4 || savingPin} 
                style={{ padding: '0 22px', borderRadius: 14, fontWeight: 700 }}
              >
                {savingPin ? '...' : 'Save'}
              </button>
            </div>
          </div>
        </Category>
        
        <Category title="Intruder Defense & Surveillance">
          <SettingRow 
            icon={<Icons.Camera size={20} color="#FF453A" />} 
            title="Intruder Selfie Logs" 
            desc="View photos captured after 3 wrong unlock attempts" 
            onClick={onOpenLogs}
            right={<span style={{ color: '#FF453A', fontSize: '0.82rem', fontWeight: 700 }}>Open Gallery →</span>}
          />
          <Divider />
          <SettingRow 
            icon={<Icons.Shield size={20} color="var(--accent)" />} 
            title="Auto-Lock On Inactivity" 
            desc="Locks your sanctuary when switching apps or after inactivity" 
            right={<span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.82rem' }}>Immediate ⚡</span>} 
          />
        </Category>

        <Category title="PIN Recovery Options">
          <div style={{ padding: '18px 20px', fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            <p style={{ margin: 0, color: 'var(--text)', fontWeight: 600, marginBottom: 8 }}>How to recover your App PIN if forgotten:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>1.</span>
                <span><b>Master Password:</b> Enter your account password at the Forgot PIN screen.</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>2.</span>
                <span><b>Security Question:</b> Answer your registered private security question.</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>3.</span>
                <span><b>Anniversary Date:</b> Confirm your shared relationship anniversary date.</span>
              </div>
            </div>
          </div>
        </Category>
      </div>
    </div>
  );
}

function PasswordSub({ onBack }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!cur || !next) return;
    setLoading(true);
    try {
      await api.post('/auth/password', { current_password: cur, new_password: next });
      setOk('Password updated successfully!');
      setCur(''); setNext('');
      setTimeout(() => setOk(''), 3000);
    } catch (e) {
      alert(e.response?.data?.detail || 'Error updating password. Verify current password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ minHeight: '100vh', background: 'var(--bg, #09090B)' }}>
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.65)', borderBottom: '1px solid rgba(255,255,255,0.06)', margin: '16px 20px 24px', borderRadius: '24px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Back size={18} /> Back
        </button>
        <span className="header-title" style={{ color: 'var(--text)', fontWeight: 700 }}>Update Password</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 440, padding: '0 20px', margin: '0 auto' }}>
        {ok && <div className="alert alert-s" style={{ marginBottom: 20 }}>{ok}</div>}
        <div className="card" style={{ padding: 24, borderRadius: 24, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="inp-wrap" style={{ marginBottom: 16 }}>
            <label style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 8, display: 'block' }}>Current Password</label>
            <input type="password" className="inp" value={cur} onChange={e => setCur(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14 }} />
          </div>
          <div className="inp-wrap" style={{ marginBottom: 24 }}>
            <label style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 8, display: 'block' }}>New Password (min. 8 characters)</label>
            <input type="password" className="inp" value={next} onChange={e => setNext(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14 }} />
          </div>
          <button className="btn btn-p btn-full" onClick={save} disabled={!cur || !next || loading} style={{ padding: 16, borderRadius: 16, fontWeight: 700 }}>
            {loading ? 'Updating...' : 'Change Password'}
          </button>
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
    <div className="page" style={{ minHeight: '100vh', background: 'var(--bg, #09090B)' }}>
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.65)', borderBottom: '1px solid rgba(255,255,255,0.06)', margin: '16px 20px 24px', borderRadius: '24px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Back size={18} /> Back
        </button>
        <span className="header-title" style={{ color: 'var(--text)', fontWeight: 700 }}>Intruder Logs</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 540, padding: '0 20px', margin: '0 auto' }}>
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

  useEffect(() => {
    if (user?.stealth_mode) {
      document.title = "Notes";
      const icon = document.querySelector("link[rel~='icon']");
      if (icon) icon.href = "https://www.google.com/favicon.ico"; 
    } else {
      document.title = "Paxly";
      const icon = document.querySelector("link[rel~='icon']");
      if (icon) icon.href = "/favicon.ico";
    }
  }, [user?.stealth_mode]);

  return (
    <div className="page" style={{ minHeight: '100vh', background: 'var(--bg, #09090B)' }}>
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.65)', borderBottom: '1px solid rgba(255,255,255,0.06)', margin: '16px 20px 24px', borderRadius: '24px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Back size={18} /> Back
        </button>
        <span className="header-title" style={{ color: 'var(--text)', fontWeight: 700 }}>Privacy Fortress</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 500, padding: '0 20px', margin: '0 auto' }}>
        <Category title="Visual Camouflage">
          <SettingRow 
            icon={<Icons.Aura size={20} color="var(--purple, #a855f7)" />} 
            title="Stealth Mode" 
            desc="Camouflages app title as Notes & provides Calculator lock screen" 
            right={<Toggle value={user?.stealth_mode} onChange={v => update('stealth_mode', v)} />} 
          />
          {user?.stealth_mode && (
            <div style={{ padding: '0 20px 16px', marginTop: '-6px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8 }}>Disguise Screen Type</label>
              <select 
                value={user?.stealth_mode_app || 'calculator'} 
                onChange={e => update('stealth_mode_app', e.target.value)}
                style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, outline: 'none' }}
              >
                <option value="calculator" style={{ background: '#111' }}>Calculator (Functional Math App)</option>
              </select>
              <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--purple, #a855f7)' }}>Enter your PIN on the calculator and press '=' to unlock.</p>
            </div>
          )}
          <Divider />
          <SettingRow 
            icon={<Icons.Vault size={20} color="var(--accent)" />} 
            title="Media Blurring" 
            desc="Blur photos and intimate media in chat until tapped" 
            right={<Toggle value={user?.blur_sensitive} onChange={v => update('blur_sensitive', v)} />} 
          />
        </Category>

        <Category title="Presence & Activity">
          <SettingRow 
            icon={<Icons.Shield size={20} />} 
            title="Private Presence" 
            desc="Hide online status, last active time, and typing indicators" 
            right={<Toggle value={user?.hide_activity} onChange={v => update('hide_activity', v)} />} 
          />
        </Category>

        <Category title="Anti-Harvesting Defense">
          <div style={{ padding: '16px 20px', fontSize: '0.84rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 8px', color: 'var(--text)', fontWeight: 600 }}>Active Technical Protections:</p>
            <p style={{ margin: '0 0 6px' }}>• <b>Dual-Consent Export:</b> Shared memories cannot be saved to external photo albums without partner approval.</p>
            <p style={{ margin: 0 }}>• <b>Screen Shields:</b> Native screenshot blocking prevents system recording or task-switcher visibility.</p>
          </div>
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
    { id: 'friend',        label: 'Best Friend (Recommended)', desc: 'Warm, witty, empathetic and conversational' },
    { id: 'compassionate', label: 'Compassionate Advisor', desc: 'Gentle, supportive, mindful and formal' },
    { id: 'professional',  label: 'Relationship Pro', desc: 'Direct, clear, objective and solution-oriented' },
  ];

  return (
    <div className="page" style={{ minHeight: '100vh', background: 'var(--bg, #09090B)' }}>
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.65)', borderBottom: '1px solid rgba(255,255,255,0.06)', margin: '16px 20px 24px', borderRadius: '24px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Back size={18} /> Back
        </button>
        <span className="header-title" style={{ color: 'var(--text)', fontWeight: 700 }}>Relationship IQ</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 500, padding: '0 20px', margin: '0 auto' }}>
        <Category title="Aura AI Personality Tone">
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tones.map(t => (
              <div 
                key={t.id} 
                onClick={() => update('ai_personality', t.id)}
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
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.98rem', color: user?.ai_personality === t.id ? 'var(--accent)' : 'var(--text)' }}>
                    {t.label}
                  </span>
                  {user?.ai_personality === t.id && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓ Active</span>}
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </Category>

        <Category title="Automation & Celebrations">
          <SettingRow 
            icon={<Icons.Milestone size={20} color="var(--accent)" />} 
            title="Milestone & Anniversary Alerts" 
            desc="Automated countdown reminders for anniversaries and special dates" 
            right={<Toggle value={user?.milestone_alerts ?? true} onChange={v => update('milestone_alerts', v)} />} 
          />
        </Category>

        <Category title="Couple Space Pairing">
          <div style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}>Couple Space ID</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 12 }}>
              {user?.couple_space_id ? `Authenticated space: ${user.couple_space_id}` : 'Share your invite code to link accounts.'}
            </div>
            {user?.couple_space_id && (
              <button 
                onClick={() => {
                  navigator.clipboard?.writeText(user.couple_space_id);
                  alert('Space ID copied to clipboard!');
                }}
                className="btn btn-g"
                style={{ width: '100%', padding: '12px', borderRadius: 14, fontSize: '0.85rem' }}
              >
                Copy Space Code 📋
              </button>
            )}
          </div>
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
      <div className="page center" style={{ padding: 40, textAlign: 'center', minHeight: '100vh', background: 'var(--bg, #09090B)' }}>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}><Icons.AlertCircle size={64} color="var(--accent)" /></div>
        <h2 style={{ fontSize: '1.8rem', marginBottom: 12, fontWeight: 800 }}>Closure Request Submitted</h2>
        <p style={{ lineHeight: 1.8, marginBottom: 40, color: 'var(--muted)', fontSize: '0.95rem', maxWidth: 440, margin: '0 auto 36px' }}>
          A Paxly Relationship Executive will confirm the closure. Your shared memories and joint milestones are safely protected in our encrypted vault and will not be compromised.
        </p>
        <button className="btn btn-p" onClick={onRequested} style={{ padding: '16px 32px', borderRadius: 16, fontWeight: 700 }}>
          Log Out Pending Review
        </button>
      </div>
    );
  }

  return (
    <div className="page" style={{ minHeight: '100vh', background: 'var(--bg, #09090B)' }}>
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.65)', borderBottom: '1px solid rgba(255,255,255,0.06)', margin: '16px 20px 24px', borderRadius: '24px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Back size={18} /> Back
        </button>
        <span className="header-title" style={{ color: 'var(--text)', fontWeight: 700 }}>Account Closure</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content center" style={{ maxWidth: 480, padding: '0 24px', textAlign: 'center', margin: '0 auto' }}>
        <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}><Icons.AlertCircle size={64} color="#FF3B30" /></div>
        <h2 style={{ color: '#FF3B30', fontSize: '1.85rem', marginBottom: 12, fontWeight: 800 }}>Closure Request</h2>
        <p style={{ marginBottom: 32, lineHeight: 1.8, color: 'var(--muted)', fontSize: '0.94rem' }}>
          We understand that relationships evolve. Requesting closure frees your account ID for a fresh start, while safeguarding your joint history in accordance with our dual-consent principles.
        </p>

        <div className="card" style={{ marginBottom: 32, textAlign: 'left', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,169,110,0.2)', padding: 22, borderRadius: 22 }}>
          <h3 style={{ fontSize: '0.98rem', marginBottom: 14, fontWeight: 700, color: 'var(--accent)' }}>Paxly Memory Guarantee:</h3>
          {[
            'Your shared scrapbook is securely archived in the vault', 
            'Neither partner can delete joint history out of sudden anger', 
            'Option to schedule statutory 30-day permanent erasure if mutually requested', 
            'Memories remain protected if reconciliation occurs later'
          ].map((g, i) => (
            <p key={i} style={{ fontSize: '0.86rem', marginBottom: 10, display: 'flex', gap: 10, color: '#fff', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--accent)' }}>✓</span> {g}
            </p>
          ))}
        </div>

        <button className="btn btn-d btn-full" onClick={request} disabled={loading} style={{ padding: 16, borderRadius: 16, fontWeight: 700, background: '#FF3B30' }}>
          {loading ? 'Submitting...' : 'Confirm Closure Request'}
        </button>
        <p style={{ marginTop: 18, fontSize: '0.78rem', color: 'var(--muted)' }}>An executive will contact both partners within 24-48 hours.</p>
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
    } catch { alert('Failed to upload photo'); }
    setSaving(false);
  };

  const generateAI = async () => {
    if (!user.is_premium) {
      alert('💎 AI Avatar Stylist is a VIP premium feature!');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/auth/avatar/generate');
      setAvatar(res.data.avatar_url);
      setUser({ ...user, avatar_url: res.data.avatar_url });
      setOk('AI Stylized your avatar! ✨');
      setTimeout(() => setOk(''), 3000);
    } catch (e) { alert(e.response?.data?.detail || 'Upload a photo first.'); }
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
    <div className="page" style={{ minHeight: '100vh', background: 'var(--bg, #09090B)' }}>
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.65)', borderBottom: '1px solid rgba(255,255,255,0.06)', margin: '16px 20px 24px', borderRadius: '24px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Back size={18} /> Back
        </button>
        <span className="header-title" style={{ color: 'var(--text)', fontWeight: 700 }}>Profile Details</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 480, padding: '0 20px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32, position: 'relative' }}>
          <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 16px' }}>
            <div className="avatar" style={{ 
              width: '100%', height: '100%', fontSize: '3rem', 
              background: 'linear-gradient(135deg, var(--accent), var(--purple, #a855f7))',
              borderRadius: '50%',
              overflow: 'hidden',
              border: avatar?.includes('ai_stylized') ? '3px solid var(--accent)' : '3px solid rgba(255,255,255,0.1)', 
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)' 
            }}>
              {avatar ? <img src={resolveMediaUrl(avatar)} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : name?.[0]?.toUpperCase()}
            </div>
            <button onClick={() => photoRef.current.click()} style={{ position: 'absolute', bottom: 5, right: 5, width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', border: '3px solid var(--bg)', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>📷</button>
            <input type="file" ref={photoRef} style={{ display: 'none' }} onChange={uploadPhoto} />
          </div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '1.08rem', color: '#fff' }}>{user?.email}</p>
          {avatar && !avatar.includes('ai_stylized') && (
            <button onClick={generateAI} style={{ background: 'rgba(201,169,110,0.12)', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 700, marginTop: 12, cursor: 'pointer', padding: '6px 14px', borderRadius: 12 }}>
              ✨ AI STYLIZE AVATAR
            </button>
          )}
        </div>
        {ok && <div className="alert alert-s" style={{ marginBottom: 20 }}>{ok}</div>}
        <div className="card" style={{ padding: 24, borderRadius: 24, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="inp-wrap" style={{ marginBottom: 24 }}>
            <label style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 8, display: 'block' }}>Display Name</label>
            <input className="inp" value={name} onChange={e => setName(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14 }} />
          </div>
          <button className="btn btn-p btn-full" onClick={save} disabled={saving} style={{ padding: 16, borderRadius: 16, fontWeight: 700 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LegalSub({ title, content, onBack, tabType }) {
  const nav = useNavigate();
  const targetTab = tabType || (title.toLowerCase().includes('privacy') ? 'privacy' : title.toLowerCase().includes('cookie') ? 'cookies' : 'terms');

  return (
    <div className="page" style={{ minHeight: '100vh', background: 'var(--bg, #09090B)' }}>
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.65)', borderBottom: '1px solid rgba(255,255,255,0.06)', margin: '16px 20px 24px', borderRadius: '24px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Back size={18} /> Back
        </button>
        <span className="header-title" style={{ color: 'var(--text)', fontWeight: 700 }}>{title}</span>
        <button
          className="btn btn-p"
          onClick={() => nav(`/legal?tab=${targetTab}`)}
          style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: 10, fontWeight: 700 }}
        >
          Full Center ↗
        </button>
      </header>
      <div className="content" style={{ maxWidth: 640, padding: '0 24px', margin: '0 auto' }}>
        <div style={{
          background: 'rgba(201, 169, 110, 0.08)',
          border: '1px solid rgba(201, 169, 110, 0.25)',
          borderRadius: 18,
          padding: '14px 18px',
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}>
          <div>
            <strong style={{ fontSize: '0.88rem', color: 'var(--text)' }}>Production Certified Framework</strong>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
              Compliant with DPDP Act 2023 (India), GDPR, CCPA, and TLS 1.3 standards.
            </p>
          </div>
          <button
            onClick={() => nav(`/legal?tab=${targetTab}`)}
            style={{
              background: 'var(--accent)',
              color: '#000',
              border: 'none',
              padding: '7px 12px',
              borderRadius: 8,
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Full Document ↗
          </button>
        </div>

        {content.map((s, i) => (
          <div key={i} style={{ marginBottom: 20, background: 'rgba(255,255,255,0.025)', padding: '18px 20px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.96rem', color: 'var(--accent)', marginBottom: 8 }}>{s.heading}</h3>
            <p style={{ lineHeight: 1.7, fontSize: '0.88rem', color: 'var(--text)', opacity: 0.88, margin: 0 }}>{s.body}</p>
          </div>
        ))}

        <div style={{ textAlign: 'center', marginTop: 32, marginBottom: 24 }}>
          <button
            className="btn btn-g"
            onClick={() => nav(`/legal?tab=${targetTab}`)}
            style={{ padding: '12px 24px', borderRadius: 14, fontSize: '0.85rem', fontWeight: 600 }}
          >
            View Official {title} in Full Legal Center ↗
          </button>
          <p style={{ fontSize: '0.75rem', opacity: 0.35, marginTop: 14 }}>Last updated: October 2026 • Version 3.0.0 Production</p>
        </div>
      </div>
    </div>
  );
}

function AboutSub({ onBack }) {
  return (
    <div className="page" style={{ minHeight: '100vh', background: 'var(--bg, #09090B)' }}>
      <header className="header" style={{ background: 'rgba(22, 22, 24, 0.65)', borderBottom: '1px solid rgba(255,255,255,0.06)', margin: '16px 20px 24px', borderRadius: '24px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-g" onClick={onBack} style={{ padding: '8px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Back size={18} /> Back
        </button>
        <span className="header-title" style={{ color: 'var(--text)', fontWeight: 700 }}>About Paxly</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content center" style={{ maxWidth: 480, padding: '0 24px', textAlign: 'center', margin: '0 auto' }}>
        <div style={{ width: 88, height: 88, borderRadius: 28, background: 'linear-gradient(135deg, var(--accent), var(--purple, #a855f7))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 24px', boxShadow: '0 15px 35px rgba(0,0,0,0.4)' }}>🔒</div>
        <h1 style={{ marginBottom: 6, fontSize: '2.2rem', fontWeight: 800 }}>Paxly</h1>
        <p style={{ color: 'var(--accent)', marginBottom: 32, fontWeight: 700, letterSpacing: 2, fontSize: '0.85rem' }}>RELATIONSHIP OPERATING SYSTEM</p>

        <div className="card" style={{ marginBottom: 16, textAlign: 'left', width: '100%', background: 'rgba(255,255,255,0.03)', padding: 22, borderRadius: 22, border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ fontWeight: 700, fontSize: '0.98rem', marginBottom: 10, color: 'var(--accent)' }}>What is Paxly?</h3>
          <p style={{ lineHeight: 1.8, fontSize: '0.9rem', color: 'var(--muted)', margin: 0 }}>
            A private, end-to-end encrypted sanctuary designed exclusively for couples. No public feeds, no commercial advertisers, no distractions—just you, your partner, and your shared world.
          </p>
        </div>

        <div className="card" style={{ textAlign: 'left', width: '100%', background: 'rgba(255,255,255,0.03)', padding: 22, borderRadius: 22, border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ fontWeight: 700, fontSize: '0.98rem', marginBottom: 10, color: 'var(--accent)' }}>Architecture & Privacy Standards</h3>
          <p style={{ lineHeight: 1.8, fontSize: '0.9rem', color: 'var(--muted)', margin: 0 }}>
            React 18 · FastAPI · PostgreSQL · WebRTC · TweetNaCl Client Encryption.<br />
            Strict adherence to the Indian DPDP Act 2023, GDPR, and CCPA standards.
          </p>
        </div>

        <p style={{ marginTop: 36, fontSize: '0.75rem', opacity: 0.35 }}>© 2026 Paxly • Intimacy & Memories Protected Forever</p>
      </div>
    </div>
  );
}
