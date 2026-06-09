const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 800 });
  
  console.log("Navigating to https://paxly-lite.vercel.app/");
  await page.goto('https://paxly-lite.vercel.app/');
  
  await page.evaluate(() => {
    localStorage.setItem('token', 'fake_token');
    localStorage.setItem('user', JSON.stringify({ id: 'user1', name: 'Shubh', has_pin: false, is_premium: true }));
    localStorage.setItem('cached_space', JSON.stringify({ space: { id: 'space1', created_at: new Date().toISOString() } }));
    localStorage.setItem('cached_partner', JSON.stringify({ id: 'user2', name: 'Partner' }));
  });
  
  console.log("Navigating to https://paxly-lite.vercel.app/chat");
  await page.goto('https://paxly-lite.vercel.app/chat');
  await new Promise(r => setTimeout(r, 5000));
  
  await page.screenshot({ path: 'live_chat_screenshot.png' });
  console.log("Screenshot saved!");
  
  await browser.close();
})();
