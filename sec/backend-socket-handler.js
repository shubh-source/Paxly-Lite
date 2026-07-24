/**
 * backend-socket-handler.js
 * --------------------------
 * Backend side (Node + Socket.io) — jaisa Vlynxly/Chaapshala me already
 * use ho raha hai, waisa hi pattern.
 */

io.on('connection', (socket) => {
  socket.on('capture_detected', async ({ sessionId, targetUserId, type, timestamp }) => {
    // 1. DB me log karo (trust/safety record ke liye)
    await CaptureLog.create({
      sessionId,
      triggeredBy: socket.userId,
      targetUserId,
      type, // 'screenshot' | 'recording'
      timestamp,
    });

    // 2. Target user real-time online hai to socket se turant bhejo
    const targetSocketId = onlineUsers.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('capture_alert', {
        sessionId,
        type,
        message:
          type === 'screenshot'
            ? 'Screenshot detected. Session ended.'
            : 'Screen recording detected. Session ended.',
      });
    }

    // 3. Offline hai to push notification (FCM/APNs) — existing setup use karo
    // await sendPushNotification(targetUserId, { title: 'Security Alert', body: '...' });
  });
});
