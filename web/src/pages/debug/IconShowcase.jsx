import React from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../../components/ui/Icons';

export default function IconShowcase() {
  const iconList = Object.keys(Icons);

  return (
    <div className="page" style={{ padding: '40px 20px', background: '#0a0a0b', minHeight: '100vh', overflowY: 'auto' }}>
      <header style={{ marginBottom: 40, textAlign: 'center' }}>
        <h1 style={{ color: 'var(--accent)', fontSize: '2rem', marginBottom: 10 }}>Premium Icon Set</h1>
        <p style={{ color: 'var(--muted)' }}>Vlynxly Custom Designed SVG Collection</p>
        <Link to="/dashboard" style={{ color: 'var(--purple)', textDecoration: 'none', fontSize: '0.9rem', marginTop: 10, display: 'inline-block' }}>← Back to Dashboard</Link>
      </header>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
        gap: 20,
        maxWidth: 1000,
        margin: '0 auto'
      }}>
        {iconList.map(name => {
          const Icon = Icons[name];
          return (
            <div key={name} className="card" style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              padding: '24px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 24,
              gap: 12,
              transition: 'all 0.3s'
            }}>
              <div style={{ color: 'var(--accent)', background: 'rgba(201,169,110,0.1)', padding: 16, borderRadius: '50%' }}>
                <Icon size={32} stroke={2} />
              </div>
              <span style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 600, opacity: 0.8 }}>{name}</span>
            </div>
          );
        })}
      </div>

      <style>{`
        .card:hover { transform: translateY(-5px); border-color: var(--accent); background: rgba(255,255,255,0.05); }
      `}</style>
    </div>
  );
}
