import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppGuard from './components/security/AppGuard';
import Layout from './components/layout/Layout';
import SplashScreen from './components/layout/SplashScreen';
import './index.css';

import Welcome        from './pages/auth/Welcome';
import Signup         from './pages/auth/Signup';
import Login          from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword  from './pages/auth/ResetPassword';
import Connect        from './pages/auth/Connect';
import SetupLock      from './pages/auth/SetupLock';
import ForgotPin      from './pages/auth/ForgotPin';
import VoiceNotes     from './pages/voice/VoiceNotes';
import Chat           from './pages/chat/Chat';
import ChatDraft      from './pages/chat/ChatDraft';
import CallScreen     from './pages/calls/CallScreen';
import AnniversaryTracker from './pages/dates/AnniversaryTracker';
import Dashboard      from './pages/Dashboard';
import MoodSync       from './pages/mood/MoodSync';
import MoodHistory    from './pages/mood/MoodHistory';
import MemoryVault    from './pages/memories/MemoryVault';
import AddMemory      from './pages/memories/AddMemory';
import Explore        from './pages/explore/Explore';
import PlaceDetail    from './pages/explore/PlaceDetail';
import AIAssistant    from './pages/ai/AIAssistant';
import AILab          from './pages/ai/AILab';
import VibeEditor     from './pages/website/VibeEditor';
import VibeViewer     from './pages/website/VibeViewer';
import Profile        from './pages/profile/Profile';
import Settings       from './pages/profile/Settings';
import SettingsDemo   from './pages/profile/SettingsDemo';
import LoveNotes      from './pages/notes/LoveNotes';
import AnniversaryTracker from './pages/dates/AnniversaryTracker';
import BucketList     from './pages/bucket/BucketList';
import LoveShop       from './pages/shop/LoveShop';
import Checkout       from './pages/shop/Checkout';
import OrderSuccess   from './pages/shop/OrderSuccess';
import Notifications  from './pages/Notifications';
import IconShowcase   from './pages/debug/IconShowcase';
import Legal          from './pages/Legal';

function Guard({ children, needsPartner = false }) {
  const { user, loading } = useAuth();
  
  if (!loading && !user) return <Navigate to="/welcome" replace />;
  if (!loading && needsPartner && !user?.couple_space_id) return <Navigate to="/connect" replace />;

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <motion.div 
          key="splash" 
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, filter: 'blur(20px)' }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
          style={{ position: 'fixed', inset: 0, zIndex: 999999 }}
        >
          <SplashScreen user={user} />
        </motion.div>
      ) : (
        <motion.div 
          key="app"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ minHeight: '100vh', width: '100%' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null; // Don't show splash on public routes
  const hasUser = user || localStorage.getItem('ros_user');
  if (hasUser) return <Navigate to="/dashboard" replace />;
  return children;
}

function AnimatedRoutes() {
  return (
    <Routes>
      <Route path="/"         element={<Navigate to="/welcome" replace />} />
        <Route path="/welcome"  element={<PublicRoute><Welcome /></PublicRoute>} />
        <Route path="/signup"   element={<PublicRoute><Signup /></PublicRoute>} />
        <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
        <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
        <Route path="/connect"  element={<Guard><Connect /></Guard>} />
        <Route path="/invite/:code" element={<Guard><Connect /></Guard>} />
        <Route path="/setup-lock" element={<Guard needsPartner><SetupLock /></Guard>} />
        <Route path="/forgot-pin" element={<Guard needsPartner><ForgotPin /></Guard>} />

        <Route path="/dashboard"  element={<Guard needsPartner><Layout><Dashboard /></Layout></Guard>} />
        <Route path="/mood"       element={<Guard needsPartner><Layout><MoodSync /></Layout></Guard>} />
        <Route path="/mood/history" element={<Guard needsPartner><Layout><MoodHistory /></Layout></Guard>} />
        <Route path="/memories"   element={<Guard needsPartner><Layout><MemoryVault /></Layout></Guard>} />
        <Route path="/memories/add" element={<Guard needsPartner><Layout><AddMemory /></Layout></Guard>} />
        <Route path="/explore"    element={<Guard needsPartner><Layout><Explore /></Layout></Guard>} />
        <Route path="/explore/:id" element={<Guard needsPartner><Layout><PlaceDetail /></Layout></Guard>} />
        <Route path="/ai"         element={<Guard needsPartner><Layout><AIAssistant /></Layout></Guard>} />
        <Route path="/ai/lab"     element={<Guard needsPartner><Layout><AILab /></Layout></Guard>} />
        <Route path="/profile"    element={<Guard needsPartner><Layout><Profile /></Layout></Guard>} />
        <Route path="/settings"   element={<Guard needsPartner><Layout><Settings /></Layout></Guard>} />
        <Route path="/settings-demo" element={<Guard needsPartner><Layout><SettingsDemo /></Layout></Guard>} />

        {/* Core Couple Features */}
        <Route path="/chat"       element={<Guard needsPartner><Layout><Chat /></Layout></Guard>} />
        <Route path="/chat-draft" element={<Guard needsPartner><Layout><ChatDraft /></Layout></Guard>} />
        <Route path="/call"       element={<Guard needsPartner><Layout><CallScreen /></Layout></Guard>} />
        <Route path="/dates"      element={<Guard needsPartner><Layout><AnniversaryTracker /></Layout></Guard>} />
        <Route path="/bucket"     element={<Guard needsPartner><Layout><BucketList /></Layout></Guard>} />
        <Route path="/shop"       element={<Guard needsPartner><Layout><LoveShop /></Layout></Guard>} />
        <Route path="/shop/checkout" element={<Guard needsPartner><Layout><Checkout /></Layout></Guard>} />
        <Route path="/voice"         element={<Guard needsPartner><Layout><VoiceNotes /></Layout></Guard>} />
        <Route path="/shop/success"  element={<Guard needsPartner><Layout><OrderSuccess /></Layout></Guard>} />
        
        <Route path="/notifications" element={<Guard needsPartner><Layout><Notifications /></Layout></Guard>} />
        
        <Route path="/website/vibe" element={<Guard needsPartner><Layout><VibeEditor /></Layout></Guard>} />
        <Route path="/website/:id"   element={<Guard needsPartner><Layout><VibeViewer /></Layout></Guard>} />
        <Route path="/legal"         element={<Guard needsPartner><Layout><Legal /></Layout></Guard>} />
        <Route path="/icons"         element={<IconShowcase />} />

        <Route path="*" element={<Navigate to="/welcome" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppGuard>
          <AnimatedRoutes />
        </AppGuard>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
