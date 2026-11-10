import api from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function setupWebPushSubscription() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const currentPerm = Notification.permission;
    if (currentPerm === 'denied') return false;

    const perm = currentPerm === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;
    if (!reg) return false;

    // Get existing subscription or create new
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const res = await api.get('/notifications/vapid-public-key');
      const publicKey = res.data?.public_key;
      if (!publicKey) return false;

      const convertedVapidKey = urlBase64ToUint8Array(publicKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
    }

    if (sub) {
      const subJson = sub.toJSON();
      await api.post('/notifications/subscribe', {
        endpoint: subJson.endpoint,
        keys: subJson.keys
      });
      return true;
    }
  } catch (err) {
    console.warn('[WebPush] setup note:', err);
  }
  return false;
}
