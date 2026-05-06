import PrivateTheatre from './PrivateTheatre';
import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getPlaces, getPlace, getCategories } from '../../services/api';
import { Icons } from '../../components/ui/Icons';


// ── DATE IDEAS DATA ───────────────────────────────────────────
const MOVIES = [
  { genre: 'Romance', emoji: '💕', movies: ['The Notebook', 'La La Land', 'About Time', 'Crazy, Stupid, Love', 'Before Sunrise'] },
  { genre: 'Comedy', emoji: '😂', movies: ['Crazy Rich Asians', '10 Things I Hate About You', 'Hitch', 'The Proposal', 'Love Actually'] },
  { genre: 'Thriller', emoji: '😱', movies: ['Gone Girl', 'Mr. & Mrs. Smith', 'The Bodyguard', 'Sleeping with the Enemy', 'Fatal Attraction'] },
  { genre: 'Adventure', emoji: '🌍', movies: ['Up', 'Wall-E', 'The Secret Life of Walter Mitty', 'Midnight in Paris', 'Roman Holiday'] },
  { genre: 'Bollywood', emoji: '🎭', movies: ['Dilwale Dulhania Le Jayenge', 'Jab We Met', 'Dil Dhadakne Do', 'Tamasha', 'Ae Dil Hai Mushkil'] },
];

const RESTAURANTS = [
  { cuisine: 'Italian', emoji: '🍝', vibe: 'Romantic dinner', desc: 'Candlelit pasta, wine, and slow evenings' },
  { cuisine: 'Japanese', emoji: '🍱', vibe: 'Fun & interactive', desc: 'Sushi dates, ramen bowls, sake together' },
  { cuisine: 'Indian', emoji: '🍛', vibe: 'Comfort & cozy', desc: 'Warm curries, naan, chai after' },
  { cuisine: 'Mexican', emoji: '🌮', vibe: 'Casual & fun', desc: 'Tacos, margaritas, good vibes' },
  { cuisine: 'Cafe', emoji: '☕', vibe: 'Chill & low-key', desc: 'Coffee, desserts, long conversations' },
  { cuisine: 'Rooftop', emoji: '🌆', vibe: 'Special occasion', desc: 'City views, cocktails, dress up' },
  { cuisine: 'Street Food', emoji: '🥘', vibe: 'Adventurous', desc: 'Explore local markets and stalls together' },
  { cuisine: 'Fine Dining', emoji: '🥂', vibe: 'Luxury', desc: 'Anniversary worthy, make it special' },
];

const ACTIVITIES = [
  { cat: 'Indoor', emoji: '🏠', ideas: [
    { name: 'Cook Together', desc: 'Pick a recipe and cook a new dish', icon: '👨‍🍳' },
    { name: 'Movie Marathon', desc: 'Pick a series and binge watch', icon: '🎬' },
    { name: 'Board Games Night', desc: 'Get competitive with classic games', icon: '🎲' },
    { name: 'Paint Together', desc: 'Buy canvases and paint each other', icon: '🎨' },
    { name: 'Build a Puzzle', desc: 'A 1000 piece puzzle and hot chocolate', icon: '🧩' },
    { name: 'Spa Night', desc: 'Face masks, music, candles at home', icon: '🧖' },
  ]},
  { cat: 'Outdoor', emoji: '🌿', ideas: [
    { name: 'Sunrise Walk', desc: 'Early morning walk to see the sunrise', icon: '🌅' },
    { name: 'Picnic', desc: 'Pack food and find a nice spot', icon: '🧺' },
    { name: 'Star Gazing', desc: 'Drive away from city lights at night', icon: '🌟' },
    { name: 'Explore a New Area', desc: 'Pick an unfamiliar neighbourhood', icon: '🗺️' },
    { name: 'Photography Walk', desc: 'Take photos of each other and the city', icon: '📸' },
    { name: 'Cycling Date', desc: 'Rent bikes and explore together', icon: '🚴' },
  ]},
  { cat: 'Special', emoji: '✨', ideas: [
    { name: 'Surprise Date', desc: 'Plan everything secretly, reveal at last moment', icon: '🎁' },
    { name: 'Recreate First Date', desc: 'Go back to where it all started', icon: '💫' },
    { name: 'Bucket List Item', desc: 'Cross something off your list together', icon: '🎯' },
    { name: 'Day Trip', desc: 'Spontaneous drive to a nearby city', icon: '🚗' },
    { name: 'Comedy Show', desc: 'Book tickets for a stand-up show', icon: '🎤' },
    { name: 'Dance Class', desc: 'Learn salsa or bachata together', icon: '💃' },
  ]},
];

// ── EXPLORE PAGE ──────────────────────────────────────────────
export function Explore() {
  const nav = useNavigate();
  const [tab, setTab] = useState('places'); // places | movies | restaurants | activities
  const [places, setPlaces] = useState([]);
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState('cafe');
  const [loading, setLoading] = useState(false);
  const [loc, setLoc] = useState(null);

  // Movie state
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [randomMovie, setRandomMovie] = useState(null);

  // Restaurant state
  const [selectedCuisine, setSelectedCuisine] = useState(null);

  // Activity state
  const [selectedCat, setSelectedCat] = useState('Indoor');
  const [randomActivity, setRandomActivity] = useState(null);

  useEffect(() => {
    getCategories().then(setCats).catch(() => setCats([
      { key: 'cafe', icon: <Icons.Coffee size={18} />, label: 'Cafes' },
      { key: 'restaurant', icon: <Icons.Utensils size={18} />, label: 'Restaurants' },
      { key: 'park', icon: <Icons.Explore size={18} />, label: 'Parks' },
      { key: 'movie', icon: <Icons.Video size={18} />, label: 'Cinemas' },
    ]));
    navigator.geolocation?.getCurrentPosition(
      p => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setLoc({ lat: null, lng: null })
    );
  }, []);

  useEffect(() => {
    if (loc === null || tab !== 'places') return;
    setLoading(true);
    getPlaces(cat, loc?.lat, loc?.lng)
      .then(setPlaces)
      .finally(() => setLoading(false));
  }, [loc, cat, tab]);

  const pickRandomMovie = (genre) => {
    const g = MOVIES.find(m => m.genre === genre);
    if (g) setRandomMovie(g.movies[Math.floor(Math.random() * g.movies.length)]);
  };

  const pickRandomActivity = () => {
    const catData = ACTIVITIES.find(a => a.cat === selectedCat);
    if (catData) setRandomActivity(catData.ideas[Math.floor(Math.random() * catData.ideas.length)]);
  };

  const TABS = [
    { key: 'places', icon: <Icons.Explore size={22} />, label: 'Places' },
    { key: 'movies', icon: <Icons.Video size={22} />, label: 'Movies' },
    { key: 'restaurants', icon: <Icons.Utensils size={22} />, label: 'Dine' },
    { key: 'activities', icon: <Icons.Target size={22} />, label: 'Activities' },
    { key: 'theatre', icon: <Icons.Home size={22} />, label: 'Private' },
  ];

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <header className="header" style={{ background:'rgba(22,22,24,0.4)', borderBottom:'1px solid rgba(255,255,255,0.05)', margin:'20px 20px 12px', borderRadius:'24px', padding:'16px 20px', boxShadow:'0 10px 30px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center' }}>
        <Link to="/dashboard" style={{ color:'var(--muted)', display: 'flex', alignItems: 'center' }}><Icons.Back size={24} /></Link>
        <span className="header-title" style={{ color:'var(--text)', marginLeft: 10 }}>Explore Together</span>
        <div style={{ width:32 }} />
      </header>

      {/* Main Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', background: 'var(--s1)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer',
            background: 'transparent', color: tab === t.key ? 'var(--accent)' : 'var(--muted)',
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            fontFamily: 'var(--font-b)', fontSize: '0.78rem', fontWeight: 500,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            transition: 'all 0.2s', whiteSpace: 'nowrap',
          }}>
            <span style={{ fontSize: '1.1rem' }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="content">

        {/* ── PLACES TAB ── */}
        {tab === 'places' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
              {cats.map(c => (
                <button key={c.key} onClick={() => setCat(c.key)} style={{
                  flexShrink: 0, padding: '7px 14px', borderRadius: 99,
                  border: `1px solid ${cat === c.key ? 'var(--accent)' : 'var(--border)'}`,
                  background: cat === c.key ? 'rgba(201,169,110,0.1)' : 'var(--s1)',
                  color: cat === c.key ? 'var(--accent)' : 'var(--muted)',
                  cursor: 'pointer', fontSize: '0.83rem', fontFamily: 'var(--font-b)',
                }}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
            {loading && <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {places.map(p => (
                <div key={p.id} className="card card-hover" style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }}
                  onClick={() => nav(`/explore/${p.id}`)}>
                  {p.image_url && <img src={p.image_url} alt={p.name} style={{ width: '100%', height: 160, objectFit: 'cover' }} />}
                  <div style={{ padding: 16 }}>
                    <h3 style={{ fontSize: '0.98rem', marginBottom: 3 }}>{p.name}</h3>
                    <p style={{ fontSize: '0.8rem', marginBottom: 6 }}>{p.address}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      {p.rating && <span style={{ color: '#F59E0B', fontSize: '0.8rem' }}>★ {p.rating}</span>}
                      {p.distance_km && <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{p.distance_km} km away</span>}
                    </div>
                  </div>
                </div>
              ))}
              {!loading && places.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📍</div>
                  <p>No places found nearby. Try a different category!</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── MOVIES TAB ── */}
        {tab === 'movies' && (
          <div>
            <p style={{ marginBottom: 20, fontSize: '0.88rem', lineHeight: 1.7 }}>
              Pick a genre for tonight's movie date 🎬
            </p>

            {randomMovie && (
              <div style={{ background: 'rgba(201,169,110,0.08)', borderRadius: 14, border: '1px solid rgba(201,169,110,0.2)', padding: 20, marginBottom: 20, textAlign: 'center' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 6, letterSpacing: 1 }}>TONIGHT'S PICK</p>
                <h2 style={{ color: 'var(--accent)', marginBottom: 12 }}>{randomMovie}</h2>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(randomMovie + ' trailer')}`} target="_blank" rel="noreferrer"
                    className="btn btn-s" style={{ fontSize: '0.82rem' }}>▶ Watch Trailer</a>
                  <a href={`https://www.google.com/search?q=${encodeURIComponent(randomMovie + ' watch online')}`} target="_blank" rel="noreferrer"
                    className="btn btn-p" style={{ fontSize: '0.82rem' }}>🎬 Find & Watch</a>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {MOVIES.map(g => (
                <div key={g.genre} className="card card-hover" style={{ cursor: 'pointer', padding: '16px 18px' }}
                  onClick={() => { setSelectedGenre(g.genre); pickRandomMovie(g.genre); }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1.4rem' }}>{g.emoji}</span>
                      <span style={{ fontWeight: 500, color: 'var(--text)', fontSize: '0.95rem' }}>{g.genre}</span>
                    </div>
                    <span style={{ color: 'var(--accent)', fontSize: '0.82rem' }}>Pick random →</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {g.movies.slice(0, 3).map(m => (
                      <span key={m} style={{ fontSize: '0.75rem', color: 'var(--muted)', background: 'var(--s2)', padding: '3px 8px', borderRadius: 99 }}>{m}</span>
                    ))}
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>+{g.movies.length - 3} more</span>
                  </div>
                </div>
              ))}
            </div>

            {/* BookMyShow link */}
            <div className="card" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: '1.8rem' }}>🎟️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--text)', marginBottom: 2 }}>Book Cinema Tickets</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Book your movie night on BookMyShow</div>
              </div>
              <a href="https://in.bookmyshow.com/explore/movies" target="_blank" rel="noreferrer"
                className="btn btn-p" style={{ fontSize: '0.82rem', flexShrink: 0 }}>Book →</a>
            </div>
          </div>
        )}

        {/* ── RESTAURANTS TAB ── */}
        {tab === 'restaurants' && (
          <div>
            <p style={{ marginBottom: 20, fontSize: '0.88rem', lineHeight: 1.7 }}>
              Can't decide where to eat? Let us help 🍽️
            </p>

            {selectedCuisine && (
              <div style={{ background: 'rgba(201,169,110,0.08)', borderRadius: 14, border: '1px solid rgba(201,169,110,0.2)', padding: 20, marginBottom: 20 }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 6, letterSpacing: 1 }}>TONIGHT'S VIBE</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: '2rem' }}>{selectedCuisine.emoji}</span>
                  <div>
                    <h3 style={{ color: 'var(--accent)', marginBottom: 2 }}>{selectedCuisine.cuisine}</h3>
                    <p style={{ fontSize: '0.82rem' }}>{selectedCuisine.desc}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href={`https://www.zomato.com/search?q=${encodeURIComponent(selectedCuisine.cuisine)}`} target="_blank" rel="noreferrer"
                    className="btn btn-s" style={{ fontSize: '0.82rem' }}>🍴 Zomato</a>
                  <a href={`https://www.swiggy.com/restaurants`} target="_blank" rel="noreferrer"
                    className="btn btn-s" style={{ fontSize: '0.82rem' }}>🛵 Swiggy</a>
                  <a href={`https://www.google.com/maps/search/${encodeURIComponent(selectedCuisine.cuisine + ' restaurant near me')}`} target="_blank" rel="noreferrer"
                    className="btn btn-p" style={{ fontSize: '0.82rem' }}>📍 Find Nearby</a>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {RESTAURANTS.map(r => (
                <div key={r.cuisine} className="card card-hover" style={{ cursor: 'pointer', padding: '14px 16px', border: selectedCuisine?.cuisine === r.cuisine ? '1px solid var(--accent)' : '1px solid var(--border)' }}
                  onClick={() => setSelectedCuisine(r)}>
                  <span style={{ fontSize: '1.8rem', display: 'block', marginBottom: 8 }}>{r.emoji}</span>
                  <div style={{ fontWeight: 500, fontSize: '0.88rem', color: 'var(--text)', marginBottom: 2 }}>{r.cuisine}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--accent)' }}>{r.vibe}</div>
                </div>
              ))}
            </div>

            {/* Spin the wheel */}
            <div className="card" style={{ marginTop: 16, textAlign: 'center', padding: 20 }}>
              <p style={{ marginBottom: 12, fontSize: '0.88rem' }}>Can't decide? Let us pick!</p>
              <button className="btn btn-p btn-full" onClick={() => setSelectedCuisine(RESTAURANTS[Math.floor(Math.random() * RESTAURANTS.length)])}>
                🎲 Surprise Me!
              </button>
            </div>
          </div>
        )}

        {/* ── PRIVATE THEATRE TAB ── */}
        {tab === 'theatre' && <PrivateTheatre />}

        {/* ── ACTIVITIES TAB ── */}
        {tab === 'activities' && (
          <div>
            <p style={{ marginBottom: 16, fontSize: '0.88rem', lineHeight: 1.7 }}>
              Ideas for your next date ✨
            </p>

            {/* Category tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {ACTIVITIES.map(a => (
                <button key={a.cat} onClick={() => { setSelectedCat(a.cat); setRandomActivity(null); }} style={{
                  flex: 1, padding: '8px 12px', borderRadius: 99,
                  border: `1px solid ${selectedCat === a.cat ? 'var(--accent)' : 'var(--border)'}`,
                  background: selectedCat === a.cat ? 'rgba(201,169,110,0.1)' : 'var(--s1)',
                  color: selectedCat === a.cat ? 'var(--accent)' : 'var(--muted)',
                  cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'var(--font-b)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}>
                  {a.cat}
                </button>
              ))}
            </div>

            {randomActivity && (
              <div style={{ background: 'rgba(201,169,110,0.08)', borderRadius: 14, border: '1px solid rgba(201,169,110,0.2)', padding: 20, marginBottom: 20, textAlign: 'center' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 8, letterSpacing: 1 }}>TONIGHT'S ACTIVITY</p>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: 8 }}>{randomActivity.icon}</span>
                <h3 style={{ color: 'var(--accent)', marginBottom: 6 }}>{randomActivity.name}</h3>
                <p style={{ fontSize: '0.85rem' }}>{randomActivity.desc}</p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ACTIVITIES.find(a => a.cat === selectedCat)?.ideas.map((idea, i) => (
                <div key={i} className="card card-hover" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' }}
                  onClick={() => setRandomActivity(idea)}>
                  <span style={{ fontSize: '1.8rem', flexShrink: 0 }}>{idea.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--text)', marginBottom: 2 }}>{idea.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{idea.desc}</div>
                  </div>
                  <span style={{ color: 'var(--accent)', fontSize: '0.82rem', flexShrink: 0 }}>Pick →</span>
                </div>
              ))}
            </div>

            <div className="card" style={{ marginTop: 16, textAlign: 'center', padding: 20 }}>
              <p style={{ marginBottom: 12, fontSize: '0.88rem' }}>Can't decide? Let fate choose!</p>
              <button className="btn btn-p btn-full" onClick={pickRandomActivity}>
                🎲 Pick for Me!
              </button>
            </div>
          </div>
        )}

      </div>
      <BottomNav />
    </div>
  );
}

// ── PLACE DETAIL ──────────────────────────────────────────────
export function PlaceDetail() {
  const { id } = useParams();
  const [place, setPlace] = useState(null);

  useEffect(() => { getPlace(id).then(setPlace); }, [id]);

  if (!place) return <div className="loading"><div className="spinner" /></div>;

  const openMaps = () => {
    if (place.latitude && place.longitude)
      window.open(`https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`, '_blank');
  };

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <header className="header">
        <Link to="/explore" style={{ color: 'var(--muted)' }}>← Back</Link>
        <div style={{ width: 24 }} />
      </header>
      {place.image_url && <img src={place.image_url} alt={place.name} style={{ width: '100%', height: 260, objectFit: 'cover' }} />}
      <div className="content" style={{ paddingTop: 22 }}>
        <h2 style={{ marginBottom: 6 }}>{place.name}</h2>
        {place.rating && <p style={{ marginBottom: 4 }}>⭐ {place.rating} rating</p>}
        <p style={{ marginBottom: 16 }}>📍 {place.address}</p>
        {place.description && <div className="card" style={{ marginBottom: 16 }}><p style={{ color: 'var(--text)', lineHeight: 1.7 }}>{place.description}</p></div>}
        <button className="btn btn-p btn-full" onClick={openMaps}>Open in Google Maps</button>
      </div>
    </div>
  );
}

export default Explore;
