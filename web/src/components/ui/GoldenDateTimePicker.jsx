import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from './Icons';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function GoldenDateTimePicker({
  isOpen,
  onClose,
  value,
  onChange,
  title = "Lock as Time Capsule",
  subtitle = "Seals note into a locked gift box until exact time",
  mode = "datetime", // 'datetime' | 'date'
  allowPast = false,
  confirmText = "Set Time Capsule"
}) {
  const [selectedDate, setSelectedDate] = useState(() => {
    if (value) {
      const d = new Date(value.includes('T') ? value : value + 'T00:00:00');
      if (!isNaN(d.getTime())) return d;
    }
    // Default to 3 hours in the future for datetime, or today for date
    if (mode === 'date') return new Date();
    return new Date(Date.now() + 3 * 60 * 60 * 1000);
  });

  // Calendar view navigation (year & month)
  const [viewYear, setViewYear] = useState(() => selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => selectedDate.getMonth());

  // Time components
  const [hour12, setHour12] = useState(() => {
    const h = selectedDate.getHours();
    return h % 12 === 0 ? 12 : h % 12;
  });
  const [minute, setMinute] = useState(() => {
    // Round to nearest 5 mins
    const m = selectedDate.getMinutes();
    return Math.round(m / 5) * 5 % 60;
  });
  const [ampm, setAmpm] = useState(() => (selectedDate.getHours() >= 12 ? 'PM' : 'AM'));

  // Sync internal state whenever value opens or changes
  useEffect(() => {
    if (isOpen) {
      let d = null;
      if (value) {
        const parsed = new Date(value.includes('T') ? value : value + 'T00:00:00');
        if (!isNaN(parsed.getTime())) d = parsed;
      }
      if (!d) {
        d = mode === 'date' ? new Date() : new Date(Date.now() + 3 * 60 * 60 * 1000);
      }
      setSelectedDate(d);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      const h = d.getHours();
      setHour12(h % 12 === 0 ? 12 : h % 12);
      setMinute(Math.round(d.getMinutes() / 5) * 5 % 60);
      setAmpm(h >= 12 ? 'PM' : 'AM');
    }
  }, [isOpen, value, mode]);

  // Recalculate target Date object when calendar day or time components change
  const currentTarget = useMemo(() => {
    let h24 = hour12 % 12;
    if (ampm === 'PM') h24 += 12;
    const target = new Date(selectedDate);
    target.setHours(h24, minute, 0, 0);
    return target;
  }, [selectedDate, hour12, minute, ampm]);

  // Calendar calculation
  const calendarDays = useMemo(() => {
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const days = [];

    // Blank spaces for offset
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ day: null });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let day = 1; day <= totalDays; day++) {
      const cellDate = new Date(viewYear, viewMonth, day);
      cellDate.setHours(0, 0, 0, 0);
      const isPast = !allowPast && cellDate < today;
      const isToday = cellDate.getTime() === today.getTime();
      const isSelected =
        selectedDate.getDate() === day &&
        selectedDate.getMonth() === viewMonth &&
        selectedDate.getFullYear() === viewYear;

      days.push({
        day,
        isPast,
        isToday,
        isSelected
      });
    }

    return days;
  }, [viewYear, viewMonth, selectedDate, allowPast]);

  if (!isOpen) return null;

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const selectDay = (day) => {
    const next = new Date(selectedDate);
    next.setFullYear(viewYear, viewMonth, day);
    setSelectedDate(next);
  };

  // Quick Romantic Presets for DateTime Mode
  const applyPreset = (presetType) => {
    const now = new Date();
    let target = new Date();

    switch (presetType) {
      case '1h':
        target = new Date(now.getTime() + 1 * 60 * 60 * 1000);
        break;
      case '3h':
        target = new Date(now.getTime() + 3 * 60 * 60 * 1000);
        break;
      case 'tonight':
        target = new Date();
        target.setHours(21, 0, 0, 0);
        if (target <= now) {
          target.setDate(target.getDate() + 1);
        }
        break;
      case 'tomorrow_morning':
        target = new Date();
        target.setDate(target.getDate() + 1);
        target.setHours(9, 0, 0, 0);
        break;
      case 'tomorrow_night':
        target = new Date();
        target.setDate(target.getDate() + 1);
        target.setHours(21, 0, 0, 0);
        break;
      case '1week':
        target = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        break;
    }

    setSelectedDate(target);
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());

    const h = target.getHours();
    setHour12(h % 12 === 0 ? 12 : h % 12);
    setMinute(Math.round(target.getMinutes() / 5) * 5 % 60);
    setAmpm(h >= 12 ? 'PM' : 'AM');
  };

  // Quick Presets for Date Only Mode
  const applyDatePreset = (presetType) => {
    const now = new Date();
    let target = new Date();

    switch (presetType) {
      case 'today':
        target = new Date();
        break;
      case 'tomorrow':
        target = new Date();
        target.setDate(target.getDate() + 1);
        break;
      case '1week':
        target = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case '1month':
        target = new Date();
        target.setMonth(target.getMonth() + 1);
        break;
      case '1year':
        target = new Date();
        target.setFullYear(target.getFullYear() + 1);
        break;
      default:
        break;
    }

    setSelectedDate(target);
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
  };

  const formatCountdown = (dateObj) => {
    const diffMs = dateObj - new Date();
    if (diffMs <= 0) return 'Immediate (Timer has passed)';

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      const remHours = diffHours % 24;
      return `in ${diffDays} day${diffDays > 1 ? 's' : ''}${remHours > 0 ? ` & ${remHours} hr${remHours > 1 ? 's' : ''}` : ''}`;
    }
    if (diffHours > 0) {
      return `in ${diffHours} hour${diffHours > 1 ? 's' : ''}${diffMinutes > 0 ? ` & ${diffMinutes} min` : ''}`;
    }
    return `in ${Math.max(1, diffMinutes)} minute${diffMinutes !== 1 ? 's' : ''}`;
  };

  const handleSave = () => {
    if (mode === 'date') {
      const y = selectedDate.getFullYear();
      const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const d = String(selectedDate.getDate()).padStart(2, '0');
      onChange(`${y}-${m}-${d}`);
      onClose();
      return;
    }

    if (currentTarget <= new Date()) {
      alert("Please select a future date and time for the time capsule.");
      return;
    }
    onChange(currentTarget.toISOString());
    onClose();
  };

  const handleClear = () => {
    onChange(null);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      zIndex: 1100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #18181c 0%, #111114 100%)',
        border: '1px solid rgba(201, 169, 110, 0.3)',
        borderRadius: 28,
        width: '100%',
        maxWidth: 480,
        maxHeight: '92vh',
        overflowY: 'auto',
        padding: '24px 22px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 30px rgba(201,169,110,0.1)',
        color: 'var(--text)',
        fontFamily: 'var(--font-b)',
        animation: 'fadeIn 0.25s ease-out'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'rgba(201, 169, 110, 0.15)',
              border: '1px solid rgba(201, 169, 110, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)'
            }}>
              {mode === 'date' ? (
                <Icons.Calendar size={18} color="var(--accent)" />
              ) : (
                <Icons.Hourglass size={18} color="var(--accent)" />
              )}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'var(--font-d)', color: 'var(--text)', fontWeight: 600 }}>
                {title}
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>
                {subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '50%',
              width: 32,
              height: 32,
              color: 'var(--muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Icons.Close size={15} color="var(--muted)" />
          </button>
        </div>

        {/* Quick Presets */}
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            {mode === 'date' ? 'Quick Date Presets' : 'Quick Romantic Presets'}
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
            {mode === 'date' ? (
              [
                { id: 'today', label: 'Today', Icon: Icons.Calendar },
                { id: 'tomorrow', label: 'Tomorrow', Icon: Icons.Sun },
                { id: '1week', label: 'In 1 Week', Icon: Icons.Sparkles },
                { id: '1month', label: 'In 1 Month', Icon: Icons.Heart },
                { id: '1year', label: 'In 1 Year', Icon: Icons.Ring },
              ].map(p => {
                const IconComp = p.Icon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyDatePreset(p.id)}
                    style={{
                      background: 'rgba(201, 169, 110, 0.06)',
                      border: '1px solid rgba(201, 169, 110, 0.2)',
                      borderRadius: 14,
                      padding: '9px 6px',
                      color: 'var(--text)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(201, 169, 110, 0.18)';
                      e.currentTarget.style.borderColor = 'var(--accent)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(201, 169, 110, 0.06)';
                      e.currentTarget.style.borderColor = 'rgba(201, 169, 110, 0.2)';
                    }}
                  >
                    <IconComp size={13} color="var(--accent)" />
                    <span>{p.label}</span>
                  </button>
                );
              })
            ) : (
              [
                { id: '1h', label: '+1 Hour', Icon: Icons.Zap },
                { id: '3h', label: '+3 Hours', Icon: Icons.Hourglass },
                { id: 'tonight', label: 'Tonight 9 PM', Icon: Icons.Moon },
                { id: 'tomorrow_morning', label: 'Tomorrow 9 AM', Icon: Icons.Sun },
                { id: 'tomorrow_night', label: 'Tomorrow 9 PM', Icon: Icons.Wine },
                { id: '1week', label: 'In 1 Week', Icon: Icons.LoveNote },
              ].map(p => {
                const IconComp = p.Icon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    style={{
                      background: 'rgba(201, 169, 110, 0.06)',
                      border: '1px solid rgba(201, 169, 110, 0.2)',
                      borderRadius: 14,
                      padding: '9px 6px',
                      color: 'var(--text)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(201, 169, 110, 0.18)';
                      e.currentTarget.style.borderColor = 'var(--accent)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(201, 169, 110, 0.06)';
                      e.currentTarget.style.borderColor = 'rgba(201, 169, 110, 0.2)';
                    }}
                  >
                    <IconComp size={13} color="var(--accent)" />
                    <span>{p.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Charcoal & Golden Calendar Section */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: 20,
          padding: '16px',
          marginBottom: 16
        }}>
          {/* Calendar Month & Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: '1rem', fontWeight: 600, fontFamily: 'var(--font-d)', color: 'var(--accent)', letterSpacing: 0.5 }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="Previous Month"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Icons.Back size={14} color="var(--text)" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="Next Month"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Icons.Back size={14} color="var(--text)" style={{ transform: 'rotate(180deg)' }} />
              </button>
            </div>
          </div>

          {/* Days of Week */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 8 }}>
            {DAYS_OF_WEEK.map(d => (
              <span key={d} style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)' }}>
                {d}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {calendarDays.map((item, idx) => {
              if (item.day === null) {
                return <div key={`blank-${idx}`} style={{ height: 36 }} />;
              }

              const { day, isPast, isToday, isSelected } = item;

              let bg = 'transparent';
              let color = 'var(--text)';
              let border = '1px solid transparent';
              let fontWeight = 500;
              let shadow = 'none';

              if (isSelected) {
                bg = 'linear-gradient(135deg, #e5c07b, #c9a96e)';
                color = '#000';
                fontWeight = 700;
                shadow = '0 0 14px rgba(201, 169, 110, 0.45)';
              } else if (isToday) {
                border = '1px solid rgba(201, 169, 110, 0.5)';
                color = 'var(--accent)';
                fontWeight = 600;
              } else if (isPast) {
                color = 'rgba(255, 255, 255, 0.2)';
              }

              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  disabled={isPast}
                  onClick={() => selectDay(day)}
                  style={{
                    height: 36,
                    borderRadius: 12,
                    background: bg,
                    color,
                    border,
                    fontWeight,
                    boxShadow: shadow,
                    cursor: isPast ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.85rem',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => {
                    if (!isSelected && !isPast) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected && !isPast) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time Selector in Charcoal & Gold (Hidden in Date mode) */}
        {mode !== 'date' && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 20,
            padding: '16px',
            marginBottom: 18
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Unlock Time (Your Local Time)
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                {hour12.toString().padStart(2, '0')}:{minute.toString().padStart(2, '0')} {ampm}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              {/* Hour Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 4 }}>HOUR</span>
                <select
                  value={hour12}
                  onChange={e => setHour12(parseInt(e.target.value, 10))}
                  style={{
                    background: '#1a1a20',
                    border: '1px solid rgba(201, 169, 110, 0.3)',
                    borderRadius: 14,
                    padding: '10px 14px',
                    color: 'var(--accent)',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                    <option key={h} value={h} style={{ background: '#1a1a20', color: '#fff' }}>
                      {h.toString().padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>

              <span style={{ fontSize: '1.4rem', color: 'var(--accent)', fontWeight: 700, marginTop: 16 }}>:</span>

              {/* Minute Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 4 }}>MINUTE</span>
                <select
                  value={minute}
                  onChange={e => setMinute(parseInt(e.target.value, 10))}
                  style={{
                    background: '#1a1a20',
                    border: '1px solid rgba(201, 169, 110, 0.3)',
                    borderRadius: 14,
                    padding: '10px 14px',
                    color: 'var(--accent)',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {Array.from({ length: 12 }, (_, i) => i * 5).map(m => (
                    <option key={m} value={m} style={{ background: '#1a1a20', color: '#fff' }}>
                      {m.toString().padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>

              {/* AM / PM Toggle */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: 8 }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 4 }}>PERIOD</span>
                <div style={{
                  display: 'flex',
                  background: '#1a1a20',
                  border: '1px solid rgba(201, 169, 110, 0.3)',
                  borderRadius: 14,
                  overflow: 'hidden',
                  padding: 2
                }}>
                  <button
                    type="button"
                    onClick={() => setAmpm('AM')}
                    style={{
                      padding: '8px 12px',
                      border: 'none',
                      borderRadius: 12,
                      background: ampm === 'AM' ? 'linear-gradient(135deg, #e5c07b, #c9a96e)' : 'transparent',
                      color: ampm === 'AM' ? '#000' : 'var(--muted)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmpm('PM')}
                    style={{
                      padding: '8px 12px',
                      border: 'none',
                      borderRadius: 12,
                      background: ampm === 'PM' ? 'linear-gradient(135deg, #e5c07b, #c9a96e)' : 'transparent',
                      color: ampm === 'PM' ? '#000' : 'var(--muted)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    PM
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Live Preview Banner */}
        <div style={{
          background: 'rgba(201, 169, 110, 0.1)',
          border: '1px solid rgba(201, 169, 110, 0.3)',
          borderRadius: 18,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: 'rgba(201, 169, 110, 0.18)',
            border: '1px solid rgba(201, 169, 110, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {mode === 'date' ? (
              <Icons.Calendar size={20} color="var(--accent)" />
            ) : (
              <Icons.Gift size={20} color="var(--accent)" />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700 }}>
              {mode === 'date' ? 'SELECTED DATE' : 'UNLOCK SCHEDULE'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '0.88rem', color: '#fff', fontWeight: 600 }}>
              {mode === 'date' ? (
                selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
              ) : (
                `${currentTarget.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} at ${hour12.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${ampm}`
              )}
            </p>
            {mode !== 'date' && (
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                ({formatCountdown(currentTarget)})
              </p>
            )}
          </div>
        </div>

        {/* Bottom Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          {value && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: 16,
                background: 'rgba(224, 112, 112, 0.15)',
                border: '1px solid rgba(224, 112, 112, 0.3)',
                color: 'var(--danger)',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '14px 18px',
              borderRadius: 16,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text)',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            style={{
              flex: 2,
              padding: '14px',
              borderRadius: 16,
              background: 'linear-gradient(135deg, #e5c07b, #c9a96e)',
              border: 'none',
              color: '#000',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(201, 169, 110, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            {mode === 'date' ? (
              <Icons.Check size={18} color="#000" stroke={2.5} />
            ) : (
              <Icons.Hourglass size={16} color="#000" />
            )}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
