import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import NotificationService from '../../services/NotificationService';
import { Icons } from '../../components/ui/Icons';

export const PRESET_OCCASIONS = [
  { id: 'anniversary', label: 'Anniversary', icon: 'Ring', defaultTitle: 'Our Anniversary', category: 'anniversary' },
  { id: 'partner_birthday', label: "Partner's Birthday", icon: 'Cake', defaultTitle: "Partner's Birthday", category: 'birthday' },
  { id: 'my_birthday', label: 'My Birthday', icon: 'Cake', defaultTitle: 'My Birthday', category: 'birthday' },
  { id: 'first_date', label: 'First Date', icon: 'Heart', defaultTitle: 'Our First Date', category: 'milestone' },
  { id: 'first_kiss', label: 'First Kiss', icon: 'Heart', defaultTitle: 'First Kiss', category: 'milestone' },
  { id: 'proposal', label: 'Proposal Day', icon: 'Diamond', defaultTitle: 'Proposal Day', category: 'anniversary' },
  { id: 'moving_in', label: 'Moving In Together', icon: 'Home', defaultTitle: 'Moving In Together', category: 'milestone' },
  { id: 'first_trip', label: 'Special Trip / Vacation', icon: 'Compass', defaultTitle: 'Our Special Trip', category: 'milestone' },
  { id: 'pet_gotcha', label: 'Pet Gotcha Day', icon: 'Heart', defaultTitle: 'Got Our Pet', category: 'milestone' },
  { id: 'first_i_love_you', label: 'First "I Love You"', icon: 'LoveNote', defaultTitle: 'First "I Love You"', category: 'milestone' },
  { id: 'valentine', label: "Valentine's Day", icon: 'Heart', defaultTitle: "Valentine's Day", category: 'milestone' },
  { id: 'new_year', label: "New Year's Eve", icon: 'Sparkles', defaultTitle: "New Year Celebration", category: 'milestone' },
  { id: 'milestone', label: 'Big Milestone', icon: 'Milestone', defaultTitle: 'Big Milestone', category: 'milestone' },
  { id: 'custom', label: 'Custom Occasion', icon: 'Star', defaultTitle: '', category: 'custom' },
];

export const AVAILABLE_ICONS = [
  'Ring', 'Heart', 'Diamond', 'Cake', 'Gift', 'Milestone', 'Star', 'Sparkles',
  'LoveNote', 'Coffee', 'Utensils', 'Compass', 'Home', 'Camera', 'Smile', 'Target'
];

export function OccasionIcon({ iconName, size = 24, color = 'currentColor', stroke = 2, className = '' }) {
  const IconComp = Icons[iconName] || Icons.Milestone;
  return <IconComp size={size} color={color} stroke={stroke} className={className} />;
}

export function getIconForDate(item) {
  if (item.icon && Icons[item.icon]) {
    return item.icon;
  }

  const rawTitle = item.title || '';
  const rawType = (item.type || '').toLowerCase();

  // Legacy emoji mapper (for previously saved dates)
  if (rawTitle.includes('💍')) return 'Ring';
  if (rawTitle.includes('🎂') || rawTitle.includes('🥳')) return 'Cake';
  if (rawTitle.includes('💘') || rawTitle.includes('❤️') || rawTitle.includes('💖') || rawTitle.includes('💋') || rawTitle.includes('🌹')) return 'Heart';
  if (rawTitle.includes('💎')) return 'Diamond';
  if (rawTitle.includes('🏠')) return 'Home';
  if (rawTitle.includes('✈️')) return 'Compass';
  if (rawTitle.includes('🐾')) return 'Heart';
  if (rawTitle.includes('💬')) return 'LoveNote';
  if (rawTitle.includes('🥂') || rawTitle.includes('🎉')) return 'Sparkles';
  if (rawTitle.includes('🎓')) return 'Milestone';
  if (rawTitle.includes('⭐') || rawTitle.includes('✨')) return 'Star';
  if (rawTitle.includes('☕')) return 'Coffee';

  // Map by type
  if (rawType === 'anniversary') return 'Ring';
  if (rawType === 'birthday' || rawType === 'partner_birthday' || rawType === 'my_birthday') return 'Cake';
  if (rawType === 'first_date' || rawType === 'first_kiss' || rawType === 'valentine') return 'Heart';
  if (rawType === 'proposal') return 'Diamond';
  if (rawType === 'moving_in') return 'Home';
  if (rawType === 'first_trip') return 'Compass';
  if (rawType === 'first_i_love_you') return 'LoveNote';
  if (rawType === 'milestone') return 'Milestone';
  if (rawType === 'custom') return 'Star';

  // Keyword check
  const lower = rawTitle.toLowerCase();
  if (/birthday|bday/i.test(lower)) return 'Cake';
  if (/anniversary/i.test(lower)) return 'Ring';
  if (/proposal|propose|ring/i.test(lower)) return 'Diamond';
  if (/date|kiss|love|valentine/i.test(lower)) return 'Heart';
  if (/trip|vacation|travel|flight/i.test(lower)) return 'Compass';
  if (/home|house|move/i.test(lower)) return 'Home';
  if (/chai|coffee|cafe/i.test(lower)) return 'Coffee';
  if (/dinner|lunch|food/i.test(lower)) return 'Utensils';

  return 'Milestone';
}

function getTimeRemaining(dateStr, now = new Date()) {
  const d = new Date(dateStr + 'T00:00:00');
  const target = new Date(now.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);

  const isToday = now.getMonth() === d.getMonth() && now.getDate() === d.getDate();
  if (isToday) {
    return {
      total: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isToday: true,
      isTomorrow: false,
      isLastWeek: false,
      isMonth: false,
      alertFrequency: 'Day-of celebration alert active',
    };
  }

  if (target < now) {
    target.setFullYear(now.getFullYear() + 1);
  }

  const diff = target.getTime() - now.getTime();
  const seconds = Math.floor((diff / 1000) % 60);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  const isTomorrow = days === 0 && diff > 0;
  const isLastWeek = days >= 0 && days <= 7;
  const isMonth = days > 7 && days <= 30;

  let alertFrequency = 'Scheduled auto-alerts';
  if (isLastWeek) {
    alertFrequency = 'Daily notifications active (last week)';
  } else if (isMonth) {
    alertFrequency = 'Weekly notifications active (1 month left)';
  }

  return {
    total: diff,
    days,
    hours,
    minutes,
    seconds,
    isToday: false,
    isTomorrow,
    isLastWeek,
    isMonth,
    alertFrequency,
  };
}

function parseDateItem(d) {
  let title = d.title || '';
  let note = d.note || '';

  // 1. Extract note if formatted with " — "
  if (!note && title.includes(' — ')) {
    const parts = title.split(' — ');
    title = parts[0].trim();
    note = parts.slice(1).join(' — ').trim();
  }

  // 2. Identify the icon first before stripping
  const iconName = getIconForDate(d);

  // 3. Strip ANY leading emojis or pictographs from the display title
  const cleanTitle = title
    .replace(/^[\p{Extended_Pictographic}\u200d\uFE0F\u2600-\u27BF\uE000-\uF8FF\s]+/u, '')
    .trim();

  return {
    ...d,
    iconName,
    displayTitle: cleanTitle || 'Special Occasion',
    displayNote: note,
  };
}

export default function AnniversaryTracker() {
  const nav = useNavigate();
  const [dates, setDates] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedOccasion, setSelectedOccasion] = useState('anniversary');
  const [customTitle, setCustomTitle] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // all | upcoming | anniversary | birthday | custom
  const [now, setNow] = useState(new Date());
  const [notifScheduled, setNotifScheduled] = useState(false);
  const [form, setForm] = useState({
    title: 'Our Anniversary',
    date: '',
    icon: 'Ring',
    note: '',
    type: 'anniversary',
    recurring: true,
  });
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Live ticking timer (updates every second for real-time countdown)
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem('cached_dates');
    if (cached) {
      try {
        setDates(JSON.parse(cached));
        setInitialLoad(false);
      } catch {}
    }
    fetchDates();
    NotificationService.requestPermissions();
  }, []);

  const fetchDates = async () => {
    try {
      const { data } = await api.get('/dates/');
      localStorage.setItem('cached_dates', JSON.stringify(data));
      setDates(data);
      if (Array.isArray(data) && data.length > 0) {
        NotificationService.scheduleAnniversaryNotifications(data);
        setNotifScheduled(true);
      }
    } catch (err) {
      console.error("Failed to fetch dates", err);
    } finally {
      setInitialLoad(false);
    }
  };

  const handleOccasionSelect = (occ) => {
    setSelectedOccasion(occ.id);
    if (occ.id === 'custom') {
      setForm(prev => ({
        ...prev,
        type: 'custom',
        icon: 'Star',
        title: customTitle,
      }));
    } else {
      setForm(prev => ({
        ...prev,
        type: occ.id,
        icon: occ.icon,
        title: occ.defaultTitle,
      }));
    }
  };

  const save = async () => {
    const finalTitle = (selectedOccasion === 'custom' ? customTitle : form.title).trim();
    if (!finalTitle || !form.date) return;

    setLoading(true);
    try {
      // Clean title without any emojis
      const payloadTitle = `${finalTitle}${form.note ? ' — ' + form.note.trim() : ''}`;
      const payload = {
        title: payloadTitle,
        date: form.date,
        type: form.type || (selectedOccasion === 'custom' ? 'custom' : 'anniversary'),
      };
      await api.post('/dates/', payload);
      setForm({ title: 'Our Anniversary', date: '', icon: 'Ring', note: '', type: 'anniversary', recurring: true });
      setSelectedOccasion('anniversary');
      setCustomTitle('');
      setShowForm(false);
      fetchDates();
    } catch (err) {
      console.error("Failed to save date", err);
    } finally {
      setLoading(false);
    }
  };

  const deleteDate = async (id, title) => {
    if (!window.confirm(`Delete "${title}" from important dates?`)) return;
    try {
      await api.delete(`/dates/${id}`);
      setDates(prev => {
        const next = prev.filter(d => d.id !== id);
        localStorage.setItem('cached_dates', JSON.stringify(next));
        return next;
      });
    } catch (err) {
      console.error("Failed to delete date", err);
    }
  };

  const parsedDates = useMemo(() => {
    return dates.map(parseDateItem);
  }, [dates]);

  const filteredDates = useMemo(() => {
    return parsedDates.filter(d => {
      const countdown = getTimeRemaining(d.date, now);
      if (activeFilter === 'all') return true;
      if (activeFilter === 'upcoming') return countdown.days <= 30;
      if (activeFilter === 'anniversary') return d.type === 'anniversary' || /anniversary/i.test(d.displayTitle);
      if (activeFilter === 'birthday') return d.type === 'birthday' || d.type === 'partner_birthday' || d.type === 'my_birthday' || /birthday/i.test(d.displayTitle);
      if (activeFilter === 'custom') return d.type === 'custom' || d.type === 'milestone';
      return true;
    });
  }, [parsedDates, activeFilter, now]);

  const sorted = useMemo(() => {
    return [...filteredDates].sort((a, b) => {
      const diffA = getTimeRemaining(a.date, now).total;
      const diffB = getTimeRemaining(b.date, now).total;
      return diffA - diffB;
    });
  }, [filteredDates, now]);

  // Closest upcoming milestone across all dates for the Hero Countdown card
  const nextMilestone = useMemo(() => {
    if (parsedDates.length === 0) return null;
    const allSorted = [...parsedDates].sort((a, b) => {
      return getTimeRemaining(a.date, now).total - getTimeRemaining(b.date, now).total;
    });
    return allSorted[0];
  }, [parsedDates, now]);

  const heroCountdown = nextMilestone ? getTimeRemaining(nextMilestone.date, now) : null;

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      {/* Header */}
      <header className="header" style={{
        background: 'rgba(22, 22, 24, 0.4)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        margin: '20px 20px 12px',
        borderRadius: '24px',
        padding: '16px 20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/dashboard" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}><Icons.Back size={24} /></Link>
          <span className="header-title" style={{ color: 'var(--text)' }}>Important Dates</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => {
              NotificationService.requestPermissions();
              if (dates.length > 0) {
                NotificationService.scheduleAnniversaryNotifications(dates);
              }
              alert('Countdown reminders synced! You will receive weekly alerts at 1 month, and daily alerts in the final week.');
            }}
            title="Notification Alerts Active"
            style={{
              background: 'rgba(201,169,110,0.12)',
              border: '1px solid rgba(201,169,110,0.3)',
              color: 'var(--accent)',
              borderRadius: 14,
              padding: '8px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.75rem',
            }}
          >
            <Icons.Bell size={16} />
            <span style={{ display: 'none' }}>Alerts</span>
          </button>
          <button className="btn btn-p" onClick={() => setShowForm(true)} style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icons.Plus size={18} color="#000" /> Add Date
          </button>
        </div>
      </header>

      {/* Featured Hero Live Countdown for Next Upcoming Milestone */}
      {nextMilestone && heroCountdown && (
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(201,169,110,0.15) 0%, rgba(22, 22, 26, 0.95) 100%)',
            borderRadius: 24,
            padding: '20px 22px',
            border: '1px solid rgba(201,169,110,0.35)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.72rem', background: 'var(--accent)', color: '#000', fontWeight: 700, padding: '3px 8px', borderRadius: 20, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Next Milestone
                </span>
                {heroCountdown.isLastWeek && (
                  <span style={{
                    fontSize: '0.7rem',
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <Icons.Flame size={12} color="#f87171" /> Final Week • Daily Alerts
                  </span>
                )}
                {heroCountdown.isMonth && (
                  <span style={{
                    fontSize: '0.7rem',
                    background: 'rgba(59, 130, 246, 0.2)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <Icons.Sparkles size={12} color="#60a5fa" /> 1 Month Left • Weekly Alerts
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                {new Date(nextMilestone.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: 'rgba(201,169,110,0.15)',
                border: '1px solid rgba(201,169,110,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                flexShrink: 0,
                boxShadow: '0 4px 14px rgba(201,169,110,0.15)',
              }}>
                <OccasionIcon iconName={nextMilestone.iconName} size={28} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text)', fontWeight: 700 }}>
                  {nextMilestone.displayTitle}
                </h3>
                {nextMilestone.displayNote && (
                  <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                    &ldquo;{nextMilestone.displayNote}&rdquo;
                  </p>
                )}
              </div>
            </div>

            {/* Live Ticking Digits */}
            {heroCountdown.isToday ? (
              <div style={{
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid var(--success)',
                padding: '12px 16px',
                borderRadius: 16,
                textAlign: 'center',
                color: 'var(--success)',
                fontWeight: 700,
                fontSize: '1.1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}>
                <Icons.Sparkles size={22} color="var(--success)" /> TODAY IS THE CELEBRATION!
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  { value: heroCountdown.days, label: 'DAYS' },
                  { value: String(heroCountdown.hours).padStart(2, '0'), label: 'HOURS' },
                  { value: String(heroCountdown.minutes).padStart(2, '0'), label: 'MINUTES' },
                  { value: String(heroCountdown.seconds).padStart(2, '0'), label: 'SECONDS' },
                ].map((item, idx) => (
                  <div key={idx} style={{
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 14,
                    padding: '8px 4px',
                    textAlign: 'center',
                  }}>
                    <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'monospace', display: 'block', lineHeight: 1.1 }}>
                      {item.value}
                    </span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.8 }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Notification alert policy note */}
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--muted)' }}>
              <Icons.Aura size={14} color="var(--accent)" />
              <span>{heroCountdown.alertFrequency}</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ padding: '0 20px 14px', display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {[
          { id: 'all', label: 'All Dates', icon: 'Calendar' },
          { id: 'upcoming', label: 'Next 30 Days', icon: 'Clock' },
          { id: 'anniversary', label: 'Anniversaries', icon: 'Ring' },
          { id: 'birthday', label: 'Birthdays', icon: 'Cake' },
          { id: 'custom', label: 'Custom & Moments', icon: 'Star' },
        ].map(tab => {
          const TabIcon = Icons[tab.icon] || Icons.Milestone;
          const isActive = activeFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              style={{
                padding: '8px 14px',
                borderRadius: 20,
                fontSize: '0.8rem',
                whiteSpace: 'nowrap',
                border: isActive ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)',
                background: isActive ? 'rgba(201,169,110,0.18)' : 'rgba(255,255,255,0.03)',
                color: isActive ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer',
                fontWeight: isActive ? 600 : 400,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <TabIcon size={14} color={isActive ? 'var(--accent)' : 'var(--muted)'} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Add Date Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{
            background: 'rgba(22, 22, 26, 0.98)',
            borderRadius: '32px 32px 0 0',
            padding: 24,
            width: '100%',
            maxWidth: 600,
            margin: '0 auto',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text)' }}>Track a Special Date</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>Choose an occasion or create your own custom one</p>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}>
                <Icons.Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>

            {/* Occasion Selection Pills */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8, display: 'block', fontWeight: 500 }}>
                Select Occasion
              </label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: 8,
                maxHeight: 180,
                overflowY: 'auto',
                padding: '4px 2px',
              }}>
                {PRESET_OCCASIONS.map(occ => {
                  const isSelected = selectedOccasion === occ.id;
                  const isCustom = occ.id === 'custom';
                  return (
                    <button
                      key={occ.id}
                      type="button"
                      onClick={() => handleOccasionSelect(occ)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 14,
                        fontSize: '0.82rem',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        background: isSelected
                          ? 'rgba(201,169,110,0.22)'
                          : isCustom
                          ? 'rgba(255,255,255,0.06)'
                          : 'rgba(255,255,255,0.03)',
                        border: isSelected
                          ? '1.5px solid var(--accent)'
                          : isCustom
                          ? '1px dashed rgba(255,255,255,0.25)'
                          : '1px solid rgba(255,255,255,0.08)',
                        color: isSelected ? 'var(--text)' : 'var(--muted)',
                        fontWeight: isSelected ? 600 : 400,
                      }}
                    >
                      <OccasionIcon iconName={occ.icon} size={18} color={isSelected ? 'var(--accent)' : 'var(--muted)'} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{occ.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* If Custom Occasion selected, show custom title input */}
            {selectedOccasion === 'custom' ? (
              <div className="inp-wrap" style={{ marginBottom: 16 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--accent)', marginBottom: 6, display: 'block', fontWeight: 600 }}>
                  Custom Occasion Name *
                </label>
                <input
                  className="inp"
                  placeholder="e.g. Chai Date at Tapri, Night Drive, Our Secret Day..."
                  value={customTitle}
                  onChange={e => setCustomTitle(e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 14,
                    border: '1px solid var(--accent)',
                    padding: '12px 14px',
                    width: '100%',
                    boxSizing: 'border-box',
                    color: 'white',
                  }}
                  autoFocus
                />
              </div>
            ) : (
              <div className="inp-wrap" style={{ marginBottom: 16 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 6, display: 'block' }}>
                  Occasion Title
                </label>
                <input
                  className="inp"
                  placeholder="e.g. Our Anniversary"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 14,
                    padding: '12px 14px',
                    width: '100%',
                    boxSizing: 'border-box',
                    color: 'white',
                  }}
                />
              </div>
            )}

            {/* SVG Icon Selection Picker */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Choose Icon:</span>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(201,169,110,0.15)',
                    padding: '2px 8px',
                    borderRadius: 8,
                    color: 'var(--accent)',
                  }}>
                    <OccasionIcon iconName={form.icon} size={16} />
                  </span>
                </label>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: 8,
                background: 'rgba(0,0,0,0.25)',
                padding: 10,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.05)',
              }}>
                {AVAILABLE_ICONS.map(iconKey => {
                  const isSelected = form.icon === iconKey;
                  return (
                    <button
                      key={iconKey}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, icon: iconKey }))}
                      title={iconKey}
                      style={{
                        background: isSelected ? 'rgba(201,169,110,0.25)' : 'rgba(255,255,255,0.03)',
                        border: isSelected ? '2px solid var(--accent)' : '1px solid transparent',
                        borderRadius: 10,
                        height: 42,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: isSelected ? 'var(--accent)' : 'var(--muted)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <OccasionIcon iconName={iconKey} size={20} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date Input */}
            <div className="inp-wrap" style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 6, display: 'block' }}>When is it? *</label>
              <input
                className="inp"
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 14,
                  padding: '12px 14px',
                  width: '100%',
                  boxSizing: 'border-box',
                  colorScheme: 'dark',
                  color: 'white',
                }}
              />
            </div>

            {/* Optional Note */}
            <div className="inp-wrap" style={{ marginBottom: 22 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 6, display: 'block' }}>A special note (optional)</label>
              <input
                className="inp"
                placeholder="e.g. Remind me to book candlelight dinner!"
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 14,
                  padding: '12px 14px',
                  width: '100%',
                  boxSizing: 'border-box',
                  color: 'white',
                }}
              />
            </div>

            <button
              className="btn btn-p btn-full"
              onClick={save}
              disabled={loading || (selectedOccasion === 'custom' ? !customTitle.trim() : !form.title.trim()) || !form.date}
              style={{
                padding: '15px',
                borderRadius: 16,
                fontSize: '0.95rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              {loading ? 'Saving...' : (
                <>
                  Keep it Remembered <Icons.Sparkles size={18} color="#000" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Dates Timeline */}
      <div style={{ padding: '0 20px' }}>
        {initialLoad ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '100px 0', opacity: 0.7 }}>
            <div className="loader" />
            <p style={{ marginTop: 16, color: 'var(--muted)', fontSize: '0.9rem' }}>Loading timeline...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', opacity: 0.85, background: 'rgba(255,255,255,0.02)', borderRadius: 24, border: '1px dashed rgba(255,255,255,0.1)' }}>
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
              <Icons.Milestone size={56} color="var(--accent)" stroke={1} />
            </div>
            <h3 style={{ marginBottom: 6, fontSize: '1.2rem' }}>
              {activeFilter === 'all' ? 'Your timeline is empty' : 'No dates in this category'}
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', maxWidth: 320, margin: '0 auto 18px' }}>
              {activeFilter === 'all'
                ? 'Add anniversaries, birthdays, or create your own custom occasion to track together.'
                : 'Try switching filters or add a new date.'}
            </p>
            <button
              className="btn btn-p"
              onClick={() => {
                if (activeFilter !== 'all') {
                  setActiveFilter('all');
                } else {
                  setShowForm(true);
                }
              }}
              style={{ padding: '8px 18px', fontSize: '0.85rem', borderRadius: 14 }}
            >
              {activeFilter !== 'all' ? 'Show All Dates' : '+ Add First Date'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sorted.map(d => {
              const countdown = getTimeRemaining(d.date, now);
              const isToday = countdown.isToday;
              const isSoon = countdown.isLastWeek;

              return (
                <div
                  key={d.id}
                  className="card card-hover"
                  style={{
                    padding: '18px 20px',
                    background: isToday ? 'rgba(34, 197, 94, 0.08)' : 'rgba(255,255,255,0.03)',
                    borderLeft: `4px solid ${isToday ? 'var(--success)' : isSoon ? 'var(--accent)' : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 18,
                    animation: 'fadeInUp 0.35s ease-out',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: 14,
                        background: 'rgba(201,169,110,0.12)',
                        border: '1px solid rgba(201,169,110,0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent)',
                        flexShrink: 0,
                      }}>
                        <OccasionIcon iconName={d.iconName} size={24} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: '1.05rem', color: 'var(--text)', wordBreak: 'break-word' }}>
                            {d.displayTitle}
                          </p>
                          {d.type === 'custom' && (
                            <span style={{
                              fontSize: '0.65rem',
                              background: 'rgba(201,169,110,0.15)',
                              color: 'var(--accent)',
                              padding: '2px 6px',
                              borderRadius: 6,
                              fontWeight: 500,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                            }}>
                              Custom
                            </span>
                          )}
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--muted)' }}>
                          {new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
                        </p>

                        {/* Live countdown timer text */}
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {isToday ? (
                            <span style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Icons.Sparkles size={13} color="var(--success)" /> Celebration Day!
                            </span>
                          ) : countdown.isTomorrow ? (
                            <span style={{ fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Icons.Clock size={13} color="var(--accent)" /> Tomorrow ({countdown.hours}h {countdown.minutes}m {countdown.seconds}s left)
                            </span>
                          ) : countdown.isLastWeek ? (
                            <span style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Icons.Flame size={13} color="#f87171" /> Final Week: {countdown.days}d {countdown.hours}h {countdown.minutes}m {countdown.seconds}s
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Icons.Clock size={13} color="var(--muted)" /> In {countdown.days} days ({countdown.hours}h {countdown.minutes}m)
                            </span>
                          )}

                          {/* Alert notification badge */}
                          {countdown.isLastWeek && (
                            <span style={{ fontSize: '0.62rem', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                              Daily Alerts
                            </span>
                          )}
                          {countdown.isMonth && (
                            <span style={{ fontSize: '0.62rem', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                              Weekly Alerts
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Days Left badge & delete action */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        textAlign: 'right',
                        background: 'rgba(255,255,255,0.03)',
                        padding: '6px 10px',
                        borderRadius: 14,
                        minWidth: 55,
                      }}>
                        <p style={{
                          margin: 0,
                          fontWeight: 700,
                          color: isToday ? 'var(--success)' : isSoon ? 'var(--accent)' : 'var(--text)',
                          fontSize: '1.1rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {isToday ? <Icons.Aura size={20} color="var(--success)" /> : countdown.days}
                        </p>
                        <p style={{ margin: 0, fontSize: '0.6rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                          {isToday ? 'TODAY' : 'DAYS'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteDate(d.id, d.displayTitle)}
                        title="Delete date"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--muted)',
                          padding: 6,
                          borderRadius: 8,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0.6,
                          transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                      >
                        <Icons.Trash size={16} color="var(--muted)" />
                      </button>
                    </div>
                  </div>

                  {d.displayNote && (
                    <div style={{
                      marginTop: 10,
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: 10,
                      fontSize: '0.84rem',
                      color: 'var(--muted)',
                      fontStyle: 'italic',
                      borderLeft: '2px solid rgba(255,255,255,0.08)',
                    }}>
                      &ldquo;{d.displayNote}&rdquo;
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
