// Instant system notifications for Paxly with ServiceWorker + Web Audio chime + Vibration support

export function playPresenceChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {}
}

export async function showInstantPresenceNotification(title, body, options = {}) {
  // 1. Device physical vibration
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate([150, 80, 150]); } catch {}
  }

  // 2. Play gentle romantic chime
  playPresenceChime();

  // 3. ServiceWorker notification (Crucial for mobile Android Chrome and throttled background tabs)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: '/logo.png',
          badge: '/logo.png',
          tag: 'partner-presence',
          renotify: true,
          silent: false,
          requireInteraction: false,
          ...options
        });
        return;
      }
    } catch (e) {
      console.warn('ServiceWorker showNotification fallback:', e);
    }
  }

  // 4. Standard window.Notification fallback (Desktop browsers)
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, {
        body,
        icon: '/logo.png',
        tag: 'partner-presence',
        renotify: true,
        silent: false,
        ...options
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
      return notif;
    } catch (e) {
      console.warn('window.Notification error:', e);
    }
  }
}
