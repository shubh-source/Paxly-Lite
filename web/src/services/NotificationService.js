import { LocalNotifications } from '@capacitor/local-notifications';

class NotificationService {
  async requestPermissions() {
    try {
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      dates.forEach(d => {
        if (!d.date) return;
        const dDate = new Date(d.date);
        dDate.setFullYear(today.getFullYear());
        
        // If the date has already passed this year, schedule for next year
        if (dDate < today) {
          dDate.setFullYear(today.getFullYear() + 1);
        }

        const idBase = d.id || Math.floor(Math.random() * 1000000);

        // Schedule 7 days before
        const sevenDaysBefore = new Date(dDate);
        sevenDaysBefore.setDate(sevenDaysBefore.getDate() - 7);
        sevenDaysBefore.setHours(10, 0, 0, 0); // 10 AM

        if (sevenDaysBefore > today) {
          notificationsToSchedule.push({
            id: parseInt(`${idBase}07`),
            title: `Aura AI: Upcoming ${d.title} ✨`,
            body: `Hey! Just 7 days left until your ${d.title}. Want me to help you plan a surprise?`,
            schedule: { at: sevenDaysBefore },
            smallIcon: 'ic_stat_aura', // Custom icon if available
          });
        }

        // Schedule 3 days before
        const threeDaysBefore = new Date(dDate);
        threeDaysBefore.setDate(threeDaysBefore.getDate() - 3);
        threeDaysBefore.setHours(12, 0, 0, 0); // 12 PM

        if (threeDaysBefore > today) {
          notificationsToSchedule.push({
            id: parseInt(`${idBase}03`),
            title: `Aura AI: Only 3 days left! ⏰`,
            body: `Your ${d.title} is almost here! Need last-minute gift ideas or a Vibe Site?`,
            schedule: { at: threeDaysBefore },
          });
        }

        // Schedule day of
        const dayOf = new Date(dDate);
        dayOf.setHours(9, 0, 0, 0); // 9 AM
        
        if (dayOf >= today) {
          notificationsToSchedule.push({
            id: parseInt(`${idBase}00`),
            title: `Aura AI: Happy ${d.title}! 🎉`,
            body: `Wishing you a wonderful ${d.title}! I'm always here if you need anything.`,
            schedule: { at: dayOf },
          });
        }
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
