import { useState, useRef, useEffect } from 'react';
import { CAMERA_FILTERS, FONTS } from '../../data/filterStyles';

export default function VlynxlyStudio({ onCapture, onClose }) {
  const [stream, setStream] = useState(null);
  const [activeFilter, setActiveFilter] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [textItems, setTextItems] = useState([]);
  const [activeTextId, setActiveTextId] = useState(null);
  
  // Preview State
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [viewMode, setViewMode] = useState('permanent'); // permanent | once | twice

  const videoRef = useRef(null);
  const galleryRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const holdTimer = useRef(null);
  const progressInterval = useRef(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', zoom: true }, 
        audio: true 
      });
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch (err) { console.error("Camera access denied", err); }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach(t => t.stop());
  };

  // --- CAPTURE LOGIC ---
  const handlePointerDown = () => {
    let count = 0;
    setRecordProgress(0);
    holdTimer.current = setTimeout(() => {
      startRecording();
    }, 3000); // 3 seconds to confirm video

    progressInterval.current = setInterval(() => {
      count += 100/30; // 30 steps of 100ms
      setRecordProgress(prev => Math.min(prev + (100 / 30), 100));
    }, 100);
  };

  const handlePointerUp = () => {
    clearTimeout(holdTimer.current);
    clearInterval(progressInterval.current);
    setRecordProgress(0);

    if (isRecording) {
      stopRecording();
    } else {
      // Prevent taking photo if we actually intended to hold but stopped before 3 sec
      // A quick tap should take a photo. If progress was less than some amount, it's a tap.
      takePhoto();
    }
  };

  const takePhoto = () => {
    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Apply Filter
    ctx.filter = CAMERA_FILTERS[activeFilter].filter;
    ctx.drawImage(video, 0, 0);

    // Apply Draggable Text
    textItems.forEach(item => {
      ctx.filter = 'none'; // Reset filter for text
      ctx.fillStyle = '#fff';
      ctx.font = `bold 40px ${FONTS[item.fontIndex].family}`;
      ctx.textAlign = 'center';
      
      // Calculate position relative to canvas
      const x = (item.x / 100) * canvas.width;
      const y = (item.y / 100) * canvas.height;
      
      // Draw background stripe
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, y - 30, canvas.width, 50);
      
      ctx.fillStyle = '#fff';
      ctx.fillText(item.text, x, y);
    });

    canvas.toBlob(blob => {
      const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      setPreviewFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      stopCamera();
    }, 'image/jpeg', 0.9);
  };

  const startRecording = () => {
    setIsRecording(true);
    chunksRef.current = [];
    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    const recorder = new MediaRecorder(stream, options);
    
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const file = new File([blob], 'video.webm', { type: 'video/webm' });
      setPreviewFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      stopCamera();
    };
    
    recorder.start();
    mediaRecorderRef.current = recorder;
  };

  const stopRecording = () => {
    setIsRecording(false);
    mediaRecorderRef.current?.stop();
  };

  // --- TEXT LOGIC ---
  const addText = () => {
    const val = prompt("Enter text:");
    if (!val) return;
    const newItem = { id: Date.now(), text: val, x: 50, y: 50, fontIndex: 0 };
    setTextItems([...textItems, newItem]);
    setActiveTextId(newItem.id);
  };

  const cycleFont = (id) => {
    setTextItems(textItems.map(t => t.id === id ? { ...t, fontIndex: (t.fontIndex + 1) % FONTS.length } : t));
  };

  const handleDrag = (e, id) => {
    if (activeTextId !== id) return;
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setTextItems(textItems.map(t => t.id === id ? { ...t, x, y } : t));
  };

  const handleSend = () => {
    let modeToPass = 'standard';
    if (viewMode === 'once') modeToPass = 'once';
    if (viewMode === 'twice') modeToPass = 'twice';
    onCapture(previewFile, modeToPass);
  };

  const cycleViewMode = () => {
    if (viewMode === 'permanent') setViewMode('once');
    else if (viewMode === 'once') setViewMode('twice');
    else setViewMode('permanent');
  };

  const closePreview = () => {
    setPreviewFile(null);
    setPreviewUrl(null);
    startCamera();
  };

  // PREVIEW SCREEN
  if (previewUrl) {
    const isVideo = previewFile.type.startsWith('video');
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#1a1614', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isVideo ? (
            <video src={previewUrl} autoPlay loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <img src={previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}

          {/* Top Back Button */}
          <button onClick={closePreview} style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 44, height: 44, color: '#fff', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>✕</button>

          {/* Bottom Control Bar */}
          <div style={{ position: 'absolute', bottom: 30, left: 20, right: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            
            {/* View Mode Toggle Button */}
            <button 
              onClick={cycleViewMode} 
              style={{ 
                background: 'rgba(26,22,20,0.8)', 
                border: '1px solid rgba(179,148,90,0.3)', 
                borderRadius: 24, 
                padding: '12px 20px', 
                color: '#b3945a', 
                fontSize: '0.9rem', 
                fontWeight: 600, 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8,
                backdropFilter: 'blur(10px)',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
              }}
            >
              {viewMode === 'permanent' ? '∞ Permanent' : viewMode === 'once' ? '1x Once View' : '2x Twice View'}
            </button>

            {/* Send Button */}
            <button 
              onClick={handleSend}
              style={{ 
                background: '#b3945a', 
                border: 'none', 
                borderRadius: '50%', 
                width: 56, 
                height: 56, 
                color: '#000', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(179,148,90,0.4)',
                transform: 'rotate(-45deg)' // Make a cool send arrow effect
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            </button>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
      
      {/* Viewfinder */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video 
           ref={videoRef} 
           autoPlay 
           muted 
           playsInline 
           style={{ 
             width: '100%', 
             height: '100%', 
             objectFit: 'cover', 
             filter: CAMERA_FILTERS[activeFilter].filter,
             transform: `scale(${zoom})` 
           }} 
        />

        {/* Draggable Overlays */}
        {textItems.map(item => (
          <div 
            key={item.id}
            onPointerDown={() => setActiveTextId(item.id)}
            onPointerMove={(e) => handleDrag(e, item.id)}
            style={{ 
              position: 'absolute', 
              left: `${item.x}%`, 
              top: `${item.y}%`, 
              transform: 'translate(-50%, -50%)',
              color: '#fff',
              padding: '8px 16px',
              background: 'rgba(0,0,0,0.5)',
              fontFamily: FONTS[item.fontIndex].family,
              fontSize: '1.5rem',
              whiteSpace: 'nowrap',
              cursor: 'move',
              borderRadius: 4,
              userSelect: 'none',
              zIndex: 2010
            }}
            onClick={(e) => { e.stopPropagation(); cycleFont(item.id); }}
          >
            {item.text}
          </div>
        ))}

        {/* UI HUD Overlay */}
        <div style={{ position: 'absolute', inset: 0, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
           <div style={{ display:'flex', justifyContent:'space-between', pointerEvents:'auto' }}>
              <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.5rem', color:'#fff' }}>✕</button>
              <div style={{ display: 'flex', gap: 20 }}>
                <input type="file" ref={galleryRef} style={{ display:'none' }} accept="image/*,video/*" onChange={(e) => {
                   const file = e.target.files[0];
                   if (file) onCapture(file);
                }} />
                <button onClick={() => galleryRef.current?.click()} style={{ background:'none', border:'none', fontSize:'1.5rem', color:'#fff' }}>🖼️</button>
                <button onClick={addText} style={{ background:'none', border:'none', fontSize:'1.5rem', color:'#fff' }}>Aa</button>
              </div>
           </div>

           <div style={{ display:'flex', flexDirection:'column', gap:20, alignItems:'center', pointerEvents:'auto' }}>
              {/* Filter Strip */}
              <div style={{ display:'flex', gap:10, overflowX:'auto', width:'100%', padding: '10px 0' }}>
                 {CAMERA_FILTERS.map((f, i) => (
                   <button 
                     key={f.id} 
                     onClick={() => setActiveFilter(i)}
                     style={{ 
                       flexShrink:0, width:60, height:60, borderRadius:'50%', 
                       border: activeFilter === i ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                       background: f.id === 'none' ? '#333' : 'linear-gradient(45deg, #f09, #09f)',
                       fontSize: '0.6rem', color:'#fff', overflow:'hidden'
                     }}
                   >
                     {f.name}
                   </button>
                 ))}
              </div>

              {/* Master Capture */}
              <div style={{ position:'relative', width:80, height:80 }}>
                {/* Progress Ring */}
                <svg style={{ position:'absolute', inset:0, transform:'rotate(-90deg)' }} width="80" height="80">
                  <circle 
                    cx="40" cy="40" r="36" 
                    fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" 
                  />
                  <circle 
                    cx="40" cy="40" r="36" 
                    fill="none" stroke="var(--accent)" strokeWidth="4" 
                    strokeDasharray="226.19"
                    strokeDashoffset={226.19 - (226.19 * recordProgress) / 100}
                    style={{ transition: 'stroke-dashoffset 0.1s linear' }}
                  />
                </svg>

                <button 
                  onPointerDown={handlePointerDown}
                  onPointerUp={handlePointerUp}
                  style={{ 
                    position:'absolute', inset:8, borderRadius:'50%', 
                    background: isRecording ? '#ff4b2b' : '#fff',
                    border:'none', transition: 'all 0.2s',
                    transform: recordProgress > 0 ? 'scale(1.1)' : 'scale(1)'
                  }}
                />
              </div>
           </div>
        </div>
      </div>

    </div>
  );
}
