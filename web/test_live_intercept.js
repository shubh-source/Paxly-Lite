const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    // Enable request interception
    await page.setRequestInterception(true);
    
    page.on('request', request => {
      if (request.url().includes('/api/auth/me')) {
        request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'user1',
            name: 'Shubh',
            email: 'shubh@gmail.com',
            has_pin: false,
            is_premium: true,
            couple_space_id: 'space1'
          })
        });
      } else if (request.url().includes('/api/chat/history')) {
        request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      } else if (request.url().includes('/api/spaces/me')) {
        request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
             space: { id: 'space1', created_at: new Date().toISOString() },
             partner: { id: 'user2', name: 'Partner' }
          })
        });
      } else {
        request.continue();
      }
    });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    
    await page.goto('https://paxly-lite.vercel.app/');
    await page.evaluate(() => {
      localStorage.setItem('token', 'fake_token');
      localStorage.setItem('user', JSON.stringify({ id: 'user1', name: 'Shubh', has_pin: false, is_premium: true, couple_space_id: 'space1' }));
    });
    
    console.log("Navigating to /chat");
    await page.goto('https://paxly-lite.vercel.app/chat');
    await new Promise(r => setTimeout(r, 5000));
    await page.screenshot({ path: 'live_chat_intercept.png' });
    console.log("Screenshot taken: live_chat_intercept.png");
    
    await browser.close();
  } catch(e) {
    console.error(e);
  }
})();
