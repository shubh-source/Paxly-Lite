const fs = require('fs');
let code = fs.readFileSync('web/src/pages/chat/Chat.jsx', 'utf8');

// 1. STATE VARIABLES
code = code.replace(
  'const [isRecordingAudio, setIsRecordingAudio] = useState(false);\n    const [audioRecorder, setAudioRecorder]       = useState(null);\n    const audioChunks = useRef([]);',
`const [recordState, setRecordState]           = useState('idle');
    const [recordTime, setRecordTime]             = useState(0);
    const [audioRecorder, setAudioRecorder]       = useState(null);
    const audioChunks                             = useRef([]);
    const recordInterval                          = useRef(null);
    const recordStartY                            = useRef(0);
    const isRecordingAudio = recordState !== 'idle';`
);

// 2. FUNCTIONS
code = code.replace(
  /const startVoiceRecord = async \(\) => \{[\s\S]*?const stopVoiceRecord = \(\) => \{[\s\S]*?\};\n/,
`const startVoiceRecord = async (e) => {
      if (e?.touches?.[0]) recordStartY.current = e.touches[0].clientY;
      else if (e?.clientY) recordStartY.current = e.clientY;
      
      try {
        const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunks.current = [];
        recorder.ondataavailable = ev => audioChunks.current.push(ev.data);
        
        recorder.onstop = async () => {
          if (audioChunks.current.length > 0) {
            const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
            const file = new File([blob], 'voice_note.webm', { type: 'audio/webm' });
            const { media_url } = await uploadMedia(file);
            wsService.sendMessage('', 'audio', media_url, false, 0);
          }
          stream.getTracks().forEach(t => t.stop());
          clearInterval(recordInterval.current);
          setRecordTime(0);
          setRecordState('idle');
          audioChunks.current = []; 
        };
        
        recorder.start();
        setAudioRecorder(recorder);
        setRecordState('holding');
        setRecordTime(0);
        recordInterval.current = setInterval(() => setRecordTime(p => p + 1), 1000);
      } catch (err) { console.error('Audio recording failed', err); }
    };

    const handleRecordMove = (e) => {
      if (recordState !== 'holding') return;
      const clientY = e?.touches?.[0]?.clientY || e.clientY;
      if (!clientY) return;
      if (recordStartY.current - clientY > 40) {
        setRecordState('locked'); 
      }
    };

    const stopVoiceRecord = () => {
      if (recordState === 'holding' && audioRecorder) {
        audioRecorder.stop(); 
      }
    };

    const cancelVoiceRecord = () => {
      if (audioRecorder) {
        audioChunks.current = []; 
        audioRecorder.stop();
      }
    };
    
    const sendLockedVoiceRecord = () => {
      if (recordState === 'locked' && audioRecorder) {
        audioRecorder.stop();
      }
    };

    const formatRecordTime = (s) => \`\${Math.floor(s/60).toString().padStart(2,'0')}:\${(s%60).toString().padStart(2,'0')}\`;

`
);

// 3. KEYFRAMES
code = code.replace(
  '@keyframes recPulse {',
  `@keyframes beatBar {
          0%, 100% { height: 4px; }
          50%      { height: 16px; }
        }
        @keyframes slideUpFade {
          0% { transform: translateY(5px); opacity: 0; }
          50% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-5px); opacity: 0; }
        }
        @keyframes recPulse {`
);

// 4. INPUT BAR
const newUI = `
          <div className="chat-input-bar">
            <input type="file" ref={fileRef} accept="image/*,video/*" onChange={onFileSelect} style={{ display:'none' }} />
  
            <div
              className="chat-input-inner"
              style={{
                background: \`\${activeTheme.accent || '#C9A96E'}0D\`,
                border: \`1px solid \${activeTheme.accent || '#C9A96E'}28\`,
                boxShadow: \`0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 \${activeTheme.accent || '#C9A96E'}15\`,
              }}
            >
              {isRecordingAudio ? (
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '0 8px', justifyContent: 'space-between', color: '#ff5a3c' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="rec-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5a3c', animation: 'recPulse 1s infinite' }} />
                    <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{formatRecordTime(recordTime)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 10 }}>
                      {[...Array(5)].map((_,i) => (
                        <div key={i} style={{ width: 3, background: '#ff5a3c', borderRadius: 2, animation: \`beatBar \${0.5 + Math.random()*0.5}s infinite ease-in-out\`, animationDelay: \`\${Math.random()}s\` }} />
                      ))}
                    </div>
                  </div>
                  {recordState === 'holding' ? (
                    <div style={{ fontSize: '0.8rem', opacity: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'slideUpFade 1.5s infinite' }}>
                      <span style={{ fontSize: 16 }}>&uarr;</span>
                      <span>Slide to lock</span>
                    </div>
                  ) : null}
                  {recordState === 'locked' && (
                    <button className="chat-icon-btn" onClick={cancelVoiceRecord} style={{ color: '#ff5a3c', marginLeft: 'auto' }}>
                      <Icons.Trash2 size={20} />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <button className="chat-icon-btn" onClick={() => setShowingStudio(true)}>
                    <Icons.Camera size={20} color={activeTheme.accent || 'var(--muted)'} />
                  </button>
                  <button className="chat-icon-btn" onClick={() => fileRef.current?.click()}>
                    <Icons.Gallery size={20} color={activeTheme.accent || 'var(--muted)'} />
                  </button>
      
                  <input
                    value={text}
                    onChange={handleType}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                    placeholder="Message"
                  />
                </>
              )}
  
              <button
                className={\`chat-send-btn\${recordState === 'holding' ? ' rec-btn' : ''}\`}
                onPointerDown={!text.trim() && recordState === 'idle' ? startVoiceRecord : undefined}
                onPointerMove={!text.trim() && recordState === 'holding' ? handleRecordMove : undefined}
                onPointerUp={recordState === 'holding' ? stopVoiceRecord : undefined}
                onPointerLeave={recordState === 'holding' ? stopVoiceRecord : undefined}
                onClick={recordState === 'locked' ? sendLockedVoiceRecord : (text.trim() ? send : undefined)}
                disabled={sending && !!text.trim()}
                style={{
                  background: isRecordingAudio
                    ? '#ff5a3c'
                    : text.trim()
                      ? activeTheme.accent || 'var(--accent)'
                      : \`\${activeTheme.accent || '#C9A96E'}18\`,
                  border: text.trim() || isRecordingAudio ? 'none' : \`1px solid \${activeTheme.accent || '#C9A96E'}33\`,
                  boxShadow: text.trim() || isRecordingAudio ? \`0 5px 16px \${isRecordingAudio ? '#ff5a3c' : activeTheme.accent || '#C9A96E'}55\` : 'none',
                  transform: recordState === 'holding' ? 'scale(1.15)' : 'scale(1)',
                }}
              >
                {text.trim() || recordState === 'locked'
                  ? <Icons.Send size={18} color={isRecordingAudio ? '#fff' : (activeTheme.textMe || '#000')} />
                  : <Icons.Mic size={18} color={isRecordingAudio ? '#fff' : (activeTheme.accent || 'var(--muted)')} />}
              </button>
            </div>
          </div>
`;

const startInput = code.indexOf('<div className="chat-input-bar">');
const endInput = code.indexOf('          {/* ── OVERLAYS', startInput);

code = code.substring(0, startInput) + newUI + code.substring(endInput);

fs.writeFileSync('web/src/pages/chat/Chat.jsx', code, 'utf8');
console.log('Script completed successfully');
