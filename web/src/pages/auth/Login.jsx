import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const { loginUser } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email:'', password:'' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      const data = await login(form.email, form.password);
      loginUser(data.access_token, data.user);
      nav(data.user.couple_space_id ? '/dashboard' : '/connect');
    } catch (ex) {
      setErr(ex.response?.data?.message || ex.response?.data?.detail || ex.message || 'Unknown Error');
    } finally { setLoading(false); }
  };

  return (
    <div className="page center" style={{ padding:'40px 24px' }}>
      <div style={{ maxWidth:400, width:'100%' }}>
        <Link to="/" style={{ color:'var(--muted)', fontSize:'0.85rem' }}>← Back</Link>
        <h2 style={{ marginTop:22, marginBottom:6 }}>Welcome Back</h2>
        <p style={{ marginBottom:28 }}>Log in to your private space.</p>
        {err && <div className="alert alert-e">{err}</div>}
        <form onSubmit={submit}>
          <div className="inp-wrap"><label>Email</label><input className="inp" type="email" placeholder="you@email.com" value={form.email} onChange={set('email')} required /></div>
          <div className="inp-wrap"><label>Password</label><input className="inp" type="password" placeholder="Your password" value={form.password} onChange={set('password')} required /></div>
          <button className="btn btn-p btn-full" style={{ marginTop:6 }} disabled={loading}>{loading ? 'Logging in...' : 'Log In'}</button>
        </form>
        <p style={{ textAlign:'center', marginTop:22 }}>New here? <Link to="/signup" style={{ color:'var(--accent)' }}>Create account</Link></p>
      </div>
    </div>
  );
}
