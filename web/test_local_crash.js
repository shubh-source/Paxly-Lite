const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
    
    console.log("Navigating to local dev server...");
    await page.goto('http://localhost:5175/');
    
    await page.evaluate(() => {
      localStorage.setItem('ros_token', 'fake_test_token');
      localStorage.setItem('ros_user', JSON.stringify({
        id: '1', name: 'Test User', email: 'test@example.com', has_pin: false, couple_space_id: 'space1', is_premium: true
      }));
      localStorage.setItem('cached_partner', JSON.stringify({ id: '2', name: 'Partner' }));
      localStorage.setItem('cached_space', JSON.stringify({ space: { id: 'space1', created_at: new Date().toISOString() }, partner: { id: '2', name: 'Partner' } }));
      localStorage.setItem('cached_messages', JSON.stringify([]));
    });
    
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.url().includes('/api/auth/me')) {
        req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '1', name: 'Test User', has_pin: false, couple_space_id: 'space1', is_premium: true }) });
      } else if (req.url().includes('/api/spaces/me')) {
        req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ space: { id: 'space1', created_at: new Date().toISOString() }, partner: { id: '2', name: 'Partner' } }) });
      } else if (req.url().includes('/api/chat/history')) {
        req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      } else if (req.url().includes('/api/')) {
        req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
      } else {
        req.continue();
      }
    });

    console.log("Navigating to /dashboard");
    await page.goto('http://localhost:5175/dashboard');
    await new Promise(r => setTimeout(r, 2000));
    
    console.log("Taking screenshot of dashboard");
    await page.screenshot({ path: 'local_chat_crash_test_dash.png' });

    console.log("Clicking Chat link");
    await page.evaluate(() => {
       const a = document.querySelector('a[href="/chat"]');
       if(a) a.click();
       else console.log("Chat link not found!");
    });
    
    await new Promise(r => setTimeout(r, 5000));
    await page.screenshot({ path: 'local_chat_crash_test_chat.png' });
    console.log("Screenshot taken: local_chat_crash_test_chat.png");
    
    await browser.close();
  } catch(e) {
    console.error(e);
  }
})();
