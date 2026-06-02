import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { updateMe } from '../../services/api';
import { Icons } from '../../components/ui/Icons';


export function Profile() {
  const { user, logoutUser, setUser } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState('');

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateMe({ name });
      setUser(updated);
      setOk('Profile updated ✨');
      setTimeout(() => setOk(''), 3000);
    } finally { setSaving(false); }
  };

  const logout = () => { logoutUser(); nav('/'); };

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
          <Link to="/dashboard" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}><Icons.Back size={24} /></Link>
          <span className="header-title" style={{ color: 'var(--text)' }}>My Identity</span>
        </div>
        <Link to="/settings" style={{ 
          background: 'rgba(255,255,255,0.05)', padding: '8px 16px', borderRadius: 16,
          color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
        }}>
          <Icons.Lock size={16} /> Settings
        </Link>
      </header>
      
      <div className="content" style={{ maxWidth: 500, padding: '0 20px' }}>
        
        {/* Avatar Identity Section */}
        <div style={{ textAlign: 'center', marginBottom: 40, position: 'relative' }}>
          <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 16px' }}>
            <div className="avatar" style={{ 
              width: '100%', height: '100%', fontSize: '3rem', 
              background: 'linear-gradient(135deg, var(--accent), var(--purple))',
              boxShadow: '0 15px 35px rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              {user?.avatar_url ? <img src={user.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : user?.name?.[0]?.toUpperCase()}
            </div>
            <Link to="/settings" style={{ position: 'absolute', bottom: 0, right: 0, width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', border: '3px solid var(--bg)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', textDecoration: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>✏️</Link>
          </div>
          <h2 style={{ marginBottom: 4, fontSize: '1.6rem', fontWeight: 800 }}>{user?.name}</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{user?.email}</p>
        </div>

        {ok && <div className="alert alert-s" style={{ marginBottom: 24 }}>{ok}</div>}

        {/* Edit Info Card */}
        <div className="card" style={{ marginBottom: 24, padding: 24, borderRadius: 24, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 700, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1 }}>Profile Details</h3>
          
          <div className="inp-wrap" style={{ marginBottom: 24 }}>
            <label style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 8, display: 'block' }}>Display Name</label>
            <input 
              className="inp" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)' }} 
            />
          </div>
          
          <button 
            className="btn btn-p btn-full" 
            onClick={save} 
            disabled={saving}
            style={{ padding: 16, borderRadius: 16, fontWeight: 700, fontSize: '1rem', letterSpacing: 0.5 }}
          >
            {saving ? 'Updating...' : 'Save Changes'}
          </button>
        </div>
        
        {/* Action Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link to="/legal" className="card card-hover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', textDecoration: 'none', color: 'var(--text)', background: 'rgba(255,255,255,0.03)', borderRadius: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(201,169,110,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icons.Shield size={20} color="var(--accent)" />
              </div>
              <span style={{ fontWeight: 600, fontSize: '1rem' }}>Legal Center</span>
            </div>
            <span style={{ color: 'var(--muted)', display: 'flex' }}><Icons.Back size={20} style={{ transform: 'rotate(180deg)' }} /></span>
          </Link>
          
          <button className="btn btn-d btn-full" onClick={logout} style={{ padding: 18, borderRadius: 24, fontWeight: 700, background: 'rgba(255, 59, 48, 0.1)', color: '#FF3B30', border: '1px solid rgba(255, 59, 48, 0.2)' }}>
            Secure Log Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default Profile;
