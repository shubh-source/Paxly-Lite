const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  console.log("Navigating to http://localhost:5174/ (to set localStorage)");
  await page.goto('http://localhost:5174/');
  
  await page.evaluate(() => {
    localStorage.setItem('token', 'fake_token');
    localStorage.setItem('user', JSON.stringify({ id: 'user1', name: 'Shubh', has_pin: false, is_premium: true }));
    localStorage.setItem('cached_space', JSON.stringify({ space: { id: 'space1', created_at: new Date().toISOString() } }));
    localStorage.setItem('cached_partner', JSON.stringify({ id: 'user2', name: 'Partner' }));
  });
  
  console.log("Navigating to http://localhost:5174/chat");
  await page.goto('http://localhost:5174/chat');
  await new Promise(r => setTimeout(r, 5000));
  
  console.log("Navigating to http://localhost:5174/ai");
  await page.goto('http://localhost:5174/ai');
  await new Promise(r => setTimeout(r, 5000));
  
  await browser.close();
})();
