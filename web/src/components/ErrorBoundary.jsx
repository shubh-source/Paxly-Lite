import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    
    // Automatically report crash to backend Sentra-style monitor
    const baseURL = import.meta.env.VITE_API_URL 
      ? `${import.meta.env.VITE_API_URL}/api` 
      : '/api';
      
    fetch(`${baseURL}/health/report-client-error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: error.toString(),
        componentStack: errorInfo.componentStack,
        url: window.location.href
      }),
    }).catch(err => console.error("Failed to report crash:", err));
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#fff', fontFamily: 'sans-serif' }}>
          <h1 style={{ color: '#ff4d4d', fontSize: '2rem', marginBottom: '1rem' }}>🚨 App Crashed</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', maxWidth: '400px', textAlign: 'center', marginBottom: '2rem' }}>
            We intercepted a critical bug. An alert has already been dispatched to Vlynxly engineers with the exact file and line number.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{ padding: '12px 24px', background: '#C9A96E', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Reload Application
          </button>
          
          {process.env.NODE_ENV === 'development' && (
             <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,0,0,0.1)', border: '1px solid #ff4d4d', borderRadius: '8px', maxWidth: '80%', overflowX: 'auto' }}>
                <p style={{ color: '#ff9999', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Developer Details:</p>
                <code style={{ fontSize: '0.8rem', color: '#ffb3b3' }}>{this.state.error?.toString()}</code>
             </div>
          )}
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
