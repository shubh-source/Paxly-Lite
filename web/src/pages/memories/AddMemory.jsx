import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createMemory } from '../../services/api';

export default function AddMemory() {
  const nav = useNavigate();
  const [form, setForm] = useState({ title:'', description:'', date: new Date().toISOString().split('T')[0] });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));

  const onFile = e => {
    const f = e.target.files[0];
    if (f) { setFile(f); setPreview(URL.createObjectURL(f)); }
  };

  const submit = async () => {
    if (!form.title.trim()) return setErr('Add a title.');
    setLoading(true); setErr('');
    try {
      await createMemory(form.title, form.description, form.date, file);
      nav('/memories');
    } catch (ex) { setErr(ex.response?.data?.detail || 'Error saving.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="page" style={{ paddingBottom:40 }}>
      <header className="header" style={{ margin: '12px 20px', borderRadius: '16px' }}>
        <Link to="/memories" style={{ color:'var(--muted)', fontSize:'0.85rem' }}>← Cancel</Link>
        <span className="header-title" style={{ color: 'var(--accent)' }}>New Moment</span>
        <div style={{ width:60 }} />
      </header>
      <div className="content">
        {err && <div className="alert alert-e">{err}</div>}
        <div onClick={() => document.getElementById('mem-img').click()}
          style={{ width:'100%', height:240, borderRadius:'var(--r)', border:'2px dashed rgba(255,255,255,0.1)', marginBottom:24, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', overflow:'hidden', background:'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)', transition: 'var(--t)' }}>
          {preview
            ? <img src={preview} alt="p" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : <div style={{ textAlign:'center', color:'var(--muted)' }}><div style={{ fontSize:'2.5rem', marginBottom:12 }}>🖼️</div><p style={{ fontWeight: 500 }}>Select a photograph</p></div>}
        </div>
        <input id="mem-img" type="file" accept="image/*" onChange={onFile} style={{ display:'none' }} />
        <div className="inp-wrap"><label>Title</label><input className="inp" placeholder="Give this moment a name..." value={form.title} onChange={set('title')} style={{ background: 'rgba(255,255,255,0.03)' }} /></div>
        <div className="inp-wrap"><label>Date</label><input className="inp" type="date" value={form.date} onChange={set('date')} style={{ background: 'rgba(255,255,255,0.03)' }} /></div>
        <div className="inp-wrap"><label>Story</label><textarea className="inp" placeholder="Describe the magic..." value={form.description} onChange={set('description')} rows={4} style={{ background: 'rgba(255,255,255,0.03)' }} /></div>
        <button className="btn btn-p btn-full" onClick={submit} disabled={loading} style={{ marginTop:12, padding: 14 }}>{loading ? 'Committing...' : 'Store Memory'}</button>
      </div>
    </div>
  );
}
