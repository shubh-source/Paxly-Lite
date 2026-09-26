/**
 * SaveRequestUI.js
 * -----------------
 * Do components:
 * 1. SaveButton — media viewer screen pe lagao, request bhejta hai
 * 2. SaveApprovalModal — partner ki taraf, app ke root me ek baar mount
 *    karo (jaise App.js ya kisi global provider me), taaki kahin se bhi
 *    request aaye to modal dikh jaye.
 */

import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { useMediaSaveRequester, useMediaSaveResponder } from './useMediaSaveRequest';

// ---------------- 1. Save Button (media viewer screen pe) ----------------

export function SaveButton({ socket, mediaId, mediaUrl, mediaType, partnerId }) {
  const { status, requestSave } = useMediaSaveRequester({
    socket,
    mediaId,
    mediaUrl,
    mediaType,
    partnerId,
  });

  const labelMap = {
    idle: 'Save to Phone',
    pending: 'Waiting for partner...',
    saving: 'Saving...',
    saved: '✓ Saved',
    denied: 'Partner declined',
    expired: 'Request expired — retry',
    error: 'Save failed — retry',
  };

  const disabled = status === 'pending' || status === 'saving' || status === 'saved';

  return (
    <TouchableOpacity
      style={[styles.saveBtn, disabled && styles.saveBtnDisabled]}
      onPress={requestSave}
      disabled={disabled}
    >
      {(status === 'pending' || status === 'saving') && (
        <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
      )}
      <Text style={styles.saveBtnText}>{labelMap[status]}</Text>
    </TouchableOpacity>
  );
}

// ---------------- 2. Approval Modal (partner ki side, global) ----------------

export function SaveApprovalModal({ socket, getSenderName, getMediaThumbnail }) {
  const [request, setRequest] = React.useState(null); // { mediaId, requesterId, timestamp }

  const { respond } = useMediaSaveResponder({
    socket,
    onIncomingRequest: (payload) => setRequest(payload),
  });

  if (!request) return null;

  const handle = (approved) => {
    respond(request.mediaId, request.requesterId, approved);
    setRequest(null);
  };

  return (
    <Modal transparent visible animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Save Request</Text>
          <Text style={styles.body}>
            {getSenderName(request.requesterId)} wants to save this media to their phone.
            Allow?
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.denyBtn} onPress={() => handle(false)}>
              <Text style={styles.denyText}>Deny</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.allowBtn} onPress={() => handle(true)}>
              <Text style={styles.allowText}>Allow</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  saveBtn: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 14 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#1c1c1c', borderRadius: 12, padding: 20, width: '85%' },
  title: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  body: { color: '#ccc', fontSize: 14, marginBottom: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  denyBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: '#3a3a3a', marginRight: 10 },
  allowBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: '#4CAF50' },
  denyText: { color: '#ccc' },
  allowText: { color: '#fff', fontWeight: '600' },
});
