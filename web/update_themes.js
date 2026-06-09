const fs = require('fs');
let code = fs.readFileSync('c:/projects/ros2/paxly-premium/web/src/data/chatThemes.js', 'utf8');

const floatingThemes = [
  'lavender', 'ocean', 'midnight', 'arctic', 'galaxy',
  'cherry', 'heartbeat', 'pastel', 'moonlit', 'loveblush'
];

floatingThemes.forEach(id => {
  // Add premium: true and "3D " prefix
  const regex = new RegExp(id + ':\\s*\\{\\s*(name:\\s*\\\'[^\\\']+\\\')', 'g');
  code = code.replace(regex, (match, nameProp) => {
    let newNameProp = nameProp.replace(/'([^']+)'/, (m, name) => `'${name.startsWith('3D') ? name : '3D ' + name}'`);
    return id + ': {\n    premium: true,\n    ' + newNameProp;
  });
});

const existingPremium = ['midnight_starlight', 'ocean_breeze', 'cozy_fireplace'];
existingPremium.forEach(id => {
  const regex = new RegExp(id + ':\\s*\\{\\s*(name:\\s*\\\'[^\\\']+\\\')', 'g');
  code = code.replace(regex, (match, nameProp) => {
    let newNameProp = nameProp.replace(/'([^']+)'/, (m, name) => `'${name.startsWith('3D') ? name : '3D ' + name}'`);
    return id + ': {\n    ' + newNameProp;
  });
});

fs.writeFileSync('c:/projects/ros2/paxly-premium/web/src/data/chatThemes.js', code);
