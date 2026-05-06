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
      setOk('Saved!');
      setTimeout(() => setOk(''), 2000);
    } finally { setSaving(false); }
  };

  const logout = () => { logoutUser(); nav('/'); };

  return (
    <div className="page" style={{ paddingBottom:80 }}>
      <header className="header" style={{ background:'rgba(22,22,24,0.4)', borderBottom:'1px solid rgba(255,255,255,0.05)', margin:'20px 20px 12px', borderRadius:'24px', padding:'16px 20px', boxShadow:'0 10px 30px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center' }}>
        <Link to="/dashboard" style={{ color:'var(--muted)', display: 'flex', alignItems: 'center' }}><Icons.Back size={24} /></Link>
        <span className="header-title" style={{ color:'var(--text)', marginLeft: 10 }}>Profile</span>
        <Link to="/settings" style={{ color:'var(--accent)', fontSize:'0.82rem', fontWeight:600, textDecoration:'none' }}>Settings</Link>
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
        
        <Link to="/legal" className="card card-hover" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', textDecoration:'none', color:'var(--text)', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <Icons.Shield size={20} color="var(--accent)" />
            <span style={{ fontWeight:600, fontSize:'0.9rem' }}>Legal Center</span>
          </div>
          <span style={{ color:'var(--muted)', fontSize:'0.8rem' }}>View Policies</span>
        </Link>

        <button className="btn btn-d btn-full" onClick={logout}>Log Out</button>
      </div>
    </div>
  );
}

export default Profile;
