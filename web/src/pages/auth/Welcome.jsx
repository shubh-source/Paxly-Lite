// Welcome.jsx
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Welcome() {
  const { user } = useAuth();
  if (user?.couple_space_id) return <Navigate to="/dashboard" />;
  if (user) return <Navigate to="/connect" />;
  return (
    <div className="page center" style={{ padding: '40px 24px', minHeight: '100vh' }}>
      <div style={{ position:'fixed', top:'-20%', left:'50%', transform:'translateX(-50%)', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, rgba(201,169,110,0.05) 0%, transparent 70%)', pointerEvents:'none' }} />
      <div style={{ maxWidth: 400, width: '100%' }}>
        <div style={{ margin:'0 auto 28px', textAlign:'center' }}>
          <img src="/logo.png" style={{ width:120, height:120, objectFit:'contain', filter:'drop-shadow(0 0 10px rgba(201,169,110,0.2))' }} alt="Vlynxly Logo" />
        </div>
        <h1 style={{ marginBottom:6 }}>Vlynxly</h1>
        <p style={{ fontSize:'0.75rem', letterSpacing:2, color:'var(--accent)', marginBottom:32, textTransform:'uppercase', fontWeight:600 }}>Private • Just You Two</p>
        <p style={{ fontSize:'1.05rem', marginBottom:44, lineHeight:1.8 }}>Your private space for two.<br/>No distractions. No feeds.<br/>Just you and your person.</p>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <Link to="/signup" className="btn btn-p btn-full" style={{ padding:'13px', fontSize:'1rem' }}>Get Started</Link>
          <Link to="/login"  className="btn btn-s btn-full" style={{ padding:'13px', fontSize:'1rem' }}>Log In</Link>
        </div>
        <p style={{ marginTop:36, fontSize:'0.78rem', opacity:0.5 }}>Private by design · Encrypted · No ads inside</p>
      </div>
    </div>
  );
}
