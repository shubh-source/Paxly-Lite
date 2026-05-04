import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import PageTransition from '../../components/layout/PageTransition';
import { motion } from 'framer-motion';

export default function Signup() {
  const { loginUser } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name:'', email:'', password:'' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      const data = await register(form.name, form.email, form.password);
      loginUser(data.access_token, data.user);
      nav(!data.user.couple_space_id ? '/connect' : (!data.user.has_pin ? '/setup-lock' : '/dashboard'));
    } catch (ex) {
      setErr(ex.response?.data?.detail || ex.message || 'Unknown Error');
    } finally { setLoading(false); }
  };

  return (
    <PageTransition layoutId="signup">
      <div className="page center" style={{ padding:'40px 24px' }}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ maxWidth:400, width:'100%' }}
        >
          <Link to="/" style={{ color:'var(--muted)', fontSize:'0.85rem' }}>← Back</Link>
          <h2 style={{ marginTop:22, marginBottom:6 }}>Create Account</h2>
          <p style={{ marginBottom:28 }}>Start your private space.</p>
          {err && <div className="alert alert-e">{err}</div>}
          <form onSubmit={submit}>
            <div className="inp-wrap"><label>Your Name</label><input className="inp" placeholder="Alex" value={form.name} onChange={set('name')} required /></div>
            <div className="inp-wrap"><label>Email</label><input className="inp" type="email" placeholder="you@email.com" value={form.email} onChange={set('email')} required /></div>
            <div className="inp-wrap"><label>Password</label><input className="inp" type="password" placeholder="Min. 6 characters" value={form.password} onChange={set('password')} required minLength={6} /></div>
            <button className="btn btn-p btn-full" style={{ marginTop:6 }} disabled={loading}>{loading ? 'Creating...' : 'Create Account'}</button>
          </form>
          <p style={{ textAlign:'center', marginTop:22 }}>Have an account? <Link to="/login" style={{ color:'var(--accent)' }}>Log in</Link></p>
        </motion.div>
      </div>
    </PageTransition>
  );
}
