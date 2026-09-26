const puppeteer = require('puppeteer');

(async () => {
  try {
    // 1. Sign up a new user on the live backend
    const randomStr = Math.random().toString(36).substring(7);
    const email = `testuser_${randomStr}@test.com`;
    console.log("Signing up with:", email);
    
    const signupRes = await fetch('https://paxly-premium-backend.onrender.com/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', email: email, password: 'password123' })
    });
    
    if (!signupRes.ok) {
        const text = await signupRes.text();
        console.error("Signup failed:", text);
        return;
    }
    const signupData = await signupRes.json();
    const token = signupData.access_token;
    console.log("Got token:", token);
    
    // 2. Fetch user profile
    const meRes = await fetch('https://paxly-premium-backend.onrender.com/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const user = await meRes.json();
    
    // 3. Open browser and set localStorage
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    
    await page.goto('https://paxly-lite.vercel.app/');
    
    await page.evaluate((t, u) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }, token, user);
    
    console.log("Navigating to /chat");
    await page.goto('https://paxly-lite.vercel.app/chat');
    await new Promise(r => setTimeout(r, 5000));
    await page.screenshot({ path: 'live_chat_screenshot2.png' });
    
    console.log("Navigating to /ai");
    await page.goto('https://paxly-lite.vercel.app/ai');
    await new Promise(r => setTimeout(r, 5000));
    
    await browser.close();
  } catch(e) {
    console.error(e);
  }
})();
