import { LocalNotifications } from '@capacitor/local-notifications';

class NotificationService {
  async requestPermissions() {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission !== 'granted') {
        try {
          await window.Notification.requestPermission();
        } catch {}
      }
      const { display } = await LocalNotifications.checkPermissions();
      if (display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
    } catch (err) {
      console.error('Failed to request notification permissions:', err);
    }
  }

  async scheduleAnniversaryNotifications(dates) {
    if (!Array.isArray(dates) || dates.length === 0) return;
    try {
      const { display } = await LocalNotifications.checkPermissions();
      if (display !== 'granted') return;

      // Cancel all previously scheduled notifications
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel(pending);
      }

      const notificationsToSchedule = [];
      const now = new Date();

      dates.forEach(d => {
        if (!d.date) return;
        const dDate = new Date(d.date + 'T00:00:00');
        let target = new Date(now.getFullYear(), dDate.getMonth(), dDate.getDate(), 0, 0, 0);

        // If target passed earlier this year, target next year
        if (target < now && (now.getMonth() !== dDate.getMonth() || now.getDate() !== dDate.getDate())) {
          target.setFullYear(now.getFullYear() + 1);
        }

        const idBase = ((d.id || Math.floor(Math.random() * 10000)) % 100000) * 100;
        const rawTitle = d.title || 'Special Occasion';
        const cleanTitle = rawTitle.replace(/^[\p{Extended_Pictographic}\u200d\uFE0F]+\s*/u, '').split(' — ')[0].trim();

        // 1. One-month window: Weekly notifications (30 days, 21 days, 14 days)
        const weeklyMilestones = [
          { days: 30, hour: 10, title: `Aura: 1 Month until ${cleanTitle} ✨`, body: `Just 30 days left until ${cleanTitle}! Start planning something memorable.` },
          { days: 21, hour: 10, title: `Aura: 3 Weeks until ${cleanTitle} 📅`, body: `3 weeks left until ${cleanTitle}. Need help planning a romantic surprise?` },
          { days: 14, hour: 10, title: `Aura: 2 Weeks until ${cleanTitle} 🎁`, body: `Only 14 days left until ${cleanTitle}! Don't forget to prepare in advance.` },
        ];

        weeklyMilestones.forEach(({ days, hour, title, body }) => {
          const scheduleTime = new Date(target);
          scheduleTime.setDate(scheduleTime.getDate() - days);
          scheduleTime.setHours(hour, 0, 0, 0);
          if (scheduleTime > now) {
            notificationsToSchedule.push({
              id: idBase + days,
              title,
              body,
              schedule: { at: scheduleTime },
              smallIcon: 'ic_stat_aura',
            });
          }
        });

        // 2. Final week: Every single day (Day 7, 6, 5, 4, 3, 2, 1, 0)
        const dailyMilestones = [
          { days: 7, hour: 10, title: `Aura: 1 Week left until ${cleanTitle}! ⏰`, body: `Final 7 days countdown started for ${cleanTitle}!` },
          { days: 6, hour: 10, title: `Aura: 6 Days until ${cleanTitle} 💖`, body: `6 days left until ${cleanTitle}. Countdown is ticking!` },
          { days: 5, hour: 10, title: `Aura: 5 Days until ${cleanTitle} 🌹`, body: `5 days left until ${cleanTitle}! Time to finalize dinner or gift plans.` },
          { days: 4, hour: 10, title: `Aura: 4 Days until ${cleanTitle} 💫`, body: `Just 4 days left until ${cleanTitle}. Getting closer!` },
          { days: 3, hour: 11, title: `Aura: Only 3 Days until ${cleanTitle}! 🔥`, body: `3 days to go for ${cleanTitle}! Last-minute reservations or surprise?` },
          { days: 2, hour: 11, title: `Aura: 2 Days to go! ⏳ ${cleanTitle}`, body: `Only 48 hours left until ${cleanTitle}! Get excited!` },
          { days: 1, hour: 12, title: `Aura: TOMORROW is ${cleanTitle}! 🔔`, body: `Tomorrow is the big day: ${cleanTitle}! Everything ready?` },
          { days: 0, hour: 9,  title: `Aura: Happy ${cleanTitle}! 🎉🥂`, body: `Wishing you both the happiest ${cleanTitle}! Make today unforgettable!` },
        ];

        dailyMilestones.forEach(({ days, hour, title, body }) => {
          const scheduleTime = new Date(target);
          scheduleTime.setDate(scheduleTime.getDate() - days);
          scheduleTime.setHours(hour, 0, 0, 0);
          if (scheduleTime > now) {
            notificationsToSchedule.push({
              id: idBase + days,
              title,
              body,
              schedule: { at: scheduleTime },
              smallIcon: 'ic_stat_aura',
            });
          }
        });
      });

      if (notificationsToSchedule.length > 0) {
        await LocalNotifications.schedule({
          notifications: notificationsToSchedule
        });
      }
    } catch (err) {
      console.error('Failed to schedule notifications:', err);
    }
  }
}

export default new NotificationService();
