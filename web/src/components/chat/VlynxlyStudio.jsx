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
      onCapture(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
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
      onCapture(new File([blob], 'video.webm', { type: 'video/webm' }));
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
