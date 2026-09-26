/**
 * backend-socket-handler.js
 * --------------------------
 * Backend side (Node + Socket.io) — jaisa Vlynxly/Chaapshala me already
 * use ho raha hai, waisa hi pattern.
 */

io.on('connection', (socket) => {
  // ---------------- Save-to-gallery consent flow ----------------

  socket.on('save_request', async ({ mediaId, requesterId, targetUserId, timestamp }) => {
    // Optional: DB me log rakho (audit trail)
    await SaveRequestLog.create({ mediaId, requesterId, targetUserId, timestamp, status: 'pending' });

    const targetSocketId = onlineUsers.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('save_request_incoming', { mediaId, requesterId, timestamp });
    } else {
      // Offline hai to push notification bhejo
      // await sendPushNotification(targetUserId, {
      //   title: 'Save Request',
      //   body: 'Your partner wants to save a photo/video. Open app to respond.',
      // });
    }
  });

  socket.on('save_response', async ({ mediaId, requesterId, approved, timestamp }) => {
    await SaveRequestLog.updateOne(
      { mediaId, requesterId },
      { status: approved ? 'approved' : 'denied', respondedAt: timestamp }
    );

    const requesterSocketId = onlineUsers.get(requesterId);
    if (requesterSocketId) {
      io.to(requesterSocketId).emit('save_response', { mediaId, approved });
    } else {
      // Requester offline hai — agla baar app open karte hi in-app notif/badge dikhao
      // (client side: pending save_response history fetch karke dikhana hoga)
    }
  });

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
