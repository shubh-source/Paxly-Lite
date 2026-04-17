import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { updateMe } from '../../services/api';
import BottomNav from '../../components/layout/BottomNav';

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
      setOk('Saved!');
      setTimeout(() => setOk(''), 2000);
    } finally { setSaving(false); }
  };

  const logout = () => { logoutUser(); nav('/'); };

  return (
    <div className="page" style={{ paddingBottom:80 }}>
      <header className="header">
        <Link to="/dashboard" style={{ color:'var(--muted)' }}>←</Link>
        <span className="header-title">Profile</span>
        <Link to="/settings" style={{ color:'var(--muted)', fontSize:'0.82rem' }}>Settings</Link>
      </header>
      <div className="content">
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div className="avatar" style={{ width:70, height:70, fontSize:'1.5rem', margin:'0 auto 12px' }}>{user?.name?.[0]?.toUpperCase()}</div>
          <h2 style={{ marginBottom:4 }}>{user?.name}</h2>
          <p>{user?.email}</p>
        </div>
        {ok && <div className="alert alert-s">{ok}</div>}
        <div className="card" style={{ marginBottom:16 }}>
          <h3 style={{ fontSize:'0.92rem', fontFamily:'var(--font-b)', fontWeight:600, marginBottom:14 }}>Edit Profile</h3>
          <div className="inp-wrap"><label>Name</label><input className="inp" value={name} onChange={e => setName(e.target.value)} /></div>
          <button className="btn btn-p" onClick={save} disabled={saving}>{saving?'Saving...':'Save'}</button>
        </div>
        <div className="card" style={{ marginBottom:16 }}>
          <p style={{ fontSize:'0.82rem', marginBottom:4 }}>Space ID: <code style={{ color:'var(--accent)' }}>{user?.couple_space_id?.slice(0,10)}...</code></p>
        </div>
        <button className="btn btn-d btn-full" onClick={logout}>Log Out</button>
      </div>
      <BottomNav />
    </div>
  );
}

export default Profile;
