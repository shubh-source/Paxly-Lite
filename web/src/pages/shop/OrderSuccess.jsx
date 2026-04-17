import { useNavigate } from 'react-router-dom';

export default function OrderSuccess() {
  const nav = useNavigate();
  return (
    <div className="page center" style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: '4rem', marginBottom: 16 }}>🎉</div>
      <h2 style={{ marginBottom: 8 }}>Order Placed!</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 28 }}>Your gift is on its way to make someone smile.</p>
      <button className="btn btn-p" onClick={() => nav('/dashboard')}>Back to Home</button>
    </div>
  );
}
