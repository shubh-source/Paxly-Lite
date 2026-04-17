import { useState, useEffect } from 'react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('ros_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export default function PrivateTheatre() {
  const [theatres, setTheatres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);  // selected theatre
  const [step, setStep] = useState('list');  // list | detail | book | confirm
  const [booking, setBooking] = useState({
    date: '', slot: '', movie_name: '',
    snacks: [], guests: 2, special_requests: '', decoration: false
  });
  const [bookedSlots, setBookedSlots] = useState([]);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/theatre/').then(r => setTheatres(r.data)).finally(() => setLoading(false));
  }, []);

  const checkAvailability = async (theatreId, date) => {
    if (!date) return;
    const r = await api.get(`/theatre/${theatreId}/availability?date=${date}`);
    setBookedSlots(r.data.booked_slots || []);
  };

  const toggleSnack = (snack) => {
    setBooking(b => {
      const exists = b.snacks.find(s => s.name === snack.name);
      return {
        ...b,
        snacks: exists ? b.snacks.filter(s => s.name !== snack.name) : [...b.snacks, snack]
      };
    });
  };

  const snackTotal = booking.snacks.reduce((a, s) => a + s.price, 0);
  const basePrice = selected ? selected.price_per_hour * 2 : 0;
  const decorationPrice = booking.decoration ? 500 : 0;
  const total = basePrice + snackTotal + decorationPrice;

  const submitBooking = async () => {
    if (!booking.date || !booking.slot || !booking.movie_name.trim()) {
      alert('Please fill date, slot and movie name.');
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post('/theatre/book', {
        theatre_id: selected.id,
        date: booking.date,
        slot: booking.slot,
        movie_name: booking.movie_name,
        snack_ids: booking.snacks.map(s => s.name),
        guests: booking.guests,
        special_requests: booking.special_requests,
        decoration: booking.decoration,
      });
      setResult(r.data);
      setStep('confirm');
    } catch (e) {
      alert(e.response?.data?.detail || 'Booking failed. Please try again.');
    }
    setSubmitting(false);
  };

  const reset = () => {
    setStep('list'); setSelected(null); setResult(null);
    setBooking({ date: '', slot: '', movie_name: '', snacks: [], guests: 2, special_requests: '', decoration: false });
    setBookedSlots([]);
  };

  // ── BOOKING CONFIRMED ──────────────────────────────────────
  if (step === 'confirm' && result) return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: '4rem', marginBottom: 16 }}>🎉</div>
      <h2 style={{ color: 'var(--success)', marginBottom: 8 }}>Booking Sent!</h2>
      <p style={{ marginBottom: 24, lineHeight: 1.8 }}>
        Your booking request has been sent to <strong style={{ color: 'var(--text)' }}>{result.theatre_name}</strong>.<br />
        They will confirm shortly.
      </p>

      <div className="card" style={{ textAlign: 'left', marginBottom: 16 }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', letterSpacing: 1, marginBottom: 12 }}>BOOKING DETAILS</p>
        {[
          ['Booking ID', `#${result.booking_id}`],
          ['Date', result.date],
          ['Time', result.slot],
          ['Movie', result.movie_name],
          ['Total', `₹${result.total_amount}`],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{k}</span>
            <span style={{ color: k === 'Total' ? 'var(--accent)' : 'var(--text)', fontWeight: k === 'Total' ? 600 : 400, fontSize: '0.88rem' }}>{v}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 20, background: 'rgba(110,207,160,0.08)', borderColor: 'rgba(110,207,160,0.2)' }}>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.8 }}>
          📞 Theatre contact: <strong style={{ color: 'var(--text)' }}>{result.contact_phone}</strong><br />
          💬 WhatsApp: <a href={`https://wa.me/${result.contact_whatsapp?.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" style={{ color: 'var(--success)' }}>{result.contact_whatsapp}</a>
        </p>
      </div>

      <button className="btn btn-p btn-full" onClick={reset}>Book Another</button>
    </div>
  );

  // ── BOOKING FORM ───────────────────────────────────────────
  if (step === 'book' && selected) return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button className="btn btn-g" onClick={() => setStep('detail')} style={{ padding: '6px 12px' }}>← Back</button>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-b)', fontSize: '1rem' }}>Book {selected.name}</h3>
      </div>

      {/* Date */}
      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>📅 Select Date</p>
        <input className="inp" type="date" value={booking.date}
          min={new Date().toISOString().split('T')[0]}
          onChange={e => { setBooking(b => ({ ...b, date: e.target.value, slot: '' })); checkAvailability(selected.id, e.target.value); }} />
      </div>

      {/* Slots */}
      {booking.date && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>🕐 Select Time Slot</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {selected.slots.map(slot => {
              const booked = bookedSlots.includes(slot);
              const active = booking.slot === slot;
              return (
                <button key={slot} disabled={booked} onClick={() => setBooking(b => ({ ...b, slot }))}
                  style={{ padding: '8px 16px', borderRadius: 99, border: `1px solid ${active ? 'var(--accent)' : booked ? 'var(--border)' : 'var(--border)'}`, background: active ? 'rgba(201,169,110,0.15)' : booked ? 'var(--s2)' : 'var(--s1)', color: active ? 'var(--accent)' : booked ? 'var(--muted)' : 'var(--text)', cursor: booked ? 'not-allowed' : 'pointer', fontSize: '0.85rem', textDecoration: booked ? 'line-through' : 'none', fontFamily: 'var(--font-b)' }}>
                  {slot} {booked ? '(Full)' : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Movie name */}
      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>🎬 Movie to Watch</p>
        <input className="inp" placeholder="Enter movie name (any movie you want!)"
          value={booking.movie_name} onChange={e => setBooking(b => ({ ...b, movie_name: e.target.value }))} />
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 6 }}>You can watch any movie — bring your own or stream on the screen</p>
      </div>

      {/* Snacks */}
      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.9rem' }}>🍿 Snacks (Optional)</p>
        <p style={{ color: 'var(--muted)', fontSize: '0.78rem', marginBottom: 14 }}>Pre-order snacks so they're ready when you arrive</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {selected.snacks.map(snack => {
            const selected_snack = booking.snacks.find(s => s.name === snack.name);
            return (
              <div key={snack.name} onClick={() => toggleSnack(snack)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: `1px solid ${selected_snack ? 'var(--accent)' : 'var(--border)'}`, background: selected_snack ? 'rgba(201,169,110,0.08)' : 'var(--s2)', cursor: 'pointer' }}>
                <span style={{ fontSize: '1.4rem' }}>{snack.emoji}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: '0.88rem', color: 'var(--text)' }}>{snack.name}</p>
                </div>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>₹{snack.price}</span>
                <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${selected_snack ? 'var(--accent)' : 'var(--border)'}`, background: selected_snack ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected_snack && <span style={{ color: '#0D0D0F', fontSize: '0.7rem' }}>✓</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Guests + Special */}
      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>👥 Guests</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn btn-s" style={{ width: 36, height: 36, padding: 0 }} onClick={() => setBooking(b => ({ ...b, guests: Math.max(2, b.guests - 1) }))}>−</button>
          <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text)', minWidth: 30, textAlign: 'center' }}>{booking.guests}</span>
          <button className="btn btn-s" style={{ width: 36, height: 36, padding: 0 }} onClick={() => setBooking(b => ({ ...b, guests: Math.min(selected.capacity, b.guests + 1) }))}>+</button>
          <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Max {selected.capacity}</span>
        </div>
      </div>

      {/* Decoration */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setBooking(b => ({ ...b, decoration: !b.decoration }))}>
          <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${booking.decoration ? 'var(--accent)' : 'var(--border)'}`, background: booking.decoration ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {booking.decoration && <span style={{ color: '#0D0D0F', fontSize: '0.8rem' }}>✓</span>}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 500, fontSize: '0.9rem', color: 'var(--text)' }}>🎊 Decoration Setup (+₹500)</p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>Balloons, fairy lights, rose petals arrangement</p>
          </div>
        </div>
      </div>

      {/* Special requests */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.9rem' }}>💬 Special Requests (Optional)</p>
        <textarea className="inp" placeholder="Any special requests? Birthday celebration, anniversary, dietary needs..." value={booking.special_requests}
          onChange={e => setBooking(b => ({ ...b, special_requests: e.target.value }))} style={{ minHeight: 80, resize: 'none' }} />
      </div>

      {/* Price breakdown */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>💰 Price Breakdown</p>
        {[
          [`Theatre (2 hrs)`, `₹${basePrice}`],
          ...(snackTotal > 0 ? [['Snacks', `₹${snackTotal}`]] : []),
          ...(booking.decoration ? [['Decoration', '₹500']] : []),
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{k}</span>
            <span style={{ color: 'var(--text)', fontSize: '0.88rem' }}>{v}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700 }}>Total</span>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '1.1rem' }}>₹{total}</span>
        </div>
      </div>

      <button className="btn btn-p btn-full" onClick={submitBooking} disabled={submitting || !booking.date || !booking.slot || !booking.movie_name.trim()} style={{ fontSize: '1rem', padding: '16px' }}>
        {submitting ? 'Sending...' : `Confirm Booking — ₹${total}`}
      </button>
      <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)', marginTop: 8 }}>Payment at venue · Theatre will confirm via call/WhatsApp</p>
    </div>
  );

  // ── THEATRE DETAIL ─────────────────────────────────────────
  if (step === 'detail' && selected) return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button className="btn btn-g" onClick={() => setStep('list')} style={{ padding: '6px 12px' }}>← Back</button>
      </div>

      <div style={{ background: 'var(--s2)', borderRadius: 14, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '4rem', marginBottom: 20 }}>🎬</div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{selected.name}</h2>
          <span style={{ color: '#F59E0B', fontWeight: 600 }}>★ {selected.rating}</span>
        </div>
        <p style={{ fontSize: '0.85rem', marginBottom: 4 }}>📍 {selected.address}</p>
        <p style={{ fontSize: '0.85rem', marginBottom: 0 }}>👥 Capacity: {selected.capacity} people · ₹{selected.price_per_hour}/hr</p>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ color: 'var(--text)', lineHeight: 1.7, fontSize: '0.9rem' }}>{selected.description}</p>
      </div>

      {/* Amenities */}
      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>✨ Amenities</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {selected.amenities?.map(a => (
            <span key={a} style={{ padding: '5px 12px', borderRadius: 99, background: 'var(--s2)', border: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--muted)' }}>✓ {a}</span>
          ))}
        </div>
      </div>

      {/* Snacks preview */}
      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>🍿 Available Snacks</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {selected.snacks?.map(s => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{s.emoji}</span>
              <div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text)' }}>{s.name}</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--accent)' }}>₹{s.price}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: 600, marginBottom: 10, fontSize: '0.9rem' }}>📞 Contact</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href={`tel:${selected.contact_phone}`} className="btn btn-s" style={{ flex: 1, fontSize: '0.82rem' }}>📞 Call</a>
          <a href={`https://wa.me/${selected.contact_whatsapp?.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="btn btn-s" style={{ flex: 1, fontSize: '0.82rem' }}>💬 WhatsApp</a>
        </div>
      </div>

      <button className="btn btn-p btn-full" onClick={() => setStep('book')} style={{ fontSize: '1rem', padding: '16px' }}>
        Book This Theatre 🎬
      </button>
    </div>
  );

  // ── THEATRE LIST ───────────────────────────────────────────
  return (
    <div>
      <p style={{ marginBottom: 20, fontSize: '0.88rem', lineHeight: 1.7 }}>
        Book a private theatre for just the two of you 🎬
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {theatres.map(t => (
            <div key={t.id} className="card card-hover" style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }}
              onClick={() => { setSelected(t); setStep('detail'); }}>
              <div style={{ background: 'var(--s2)', height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem' }}>🎬</div>
              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>{t.name}</h3>
                  <span style={{ color: '#F59E0B', fontSize: '0.85rem' }}>★ {t.rating}</span>
                </div>
                <p style={{ margin: '0 0 6px', fontSize: '0.8rem' }}>📍 {t.address}</p>
                <p style={{ margin: '0 0 10px', fontSize: '0.82rem', lineHeight: 1.5 }}>{t.description?.slice(0, 80)}...</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', background: 'var(--s2)', padding: '3px 8px', borderRadius: 99, border: '1px solid var(--border)' }}>👥 Max {t.capacity}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent)', background: 'rgba(201,169,110,0.08)', padding: '3px 8px', borderRadius: 99, border: '1px solid rgba(201,169,110,0.2)' }}>₹{t.price_per_hour}/hr</span>
                  </div>
                  <span style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>View →</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
