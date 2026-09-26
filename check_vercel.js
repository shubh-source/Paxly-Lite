const https = require('https');

https.get('https://paxly-lite.vercel.app/', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const match = data.match(/src="(\/assets\/index-[^\"]+\.js)"/);
    if (match) {
      const jsUrl = 'https://paxly-lite.vercel.app' + match[1];
      console.log('Fetching:', jsUrl);
      https.get(jsUrl, (res2) => {
        let jsData = '';
        res2.on('data', (chunk) => { jsData += chunk; });
        res2.on('end', () => {
          if (jsData.includes('chat-top-card')) {
             console.log('SUCCESS: Vercel has the chat-top-card fix!');
          } else {
             console.log('FAIL: Vercel does NOT have the chat-top-card fix!');
          }
        });
      });
    } else {
      console.log('No JS bundle found in HTML.');
    }
  });
}).on('error', (err) => {
  console.log('Error:', err.message);
});
