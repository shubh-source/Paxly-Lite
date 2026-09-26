const fs = require('fs');
const draftPath = 'web/src/components/chat/ChatBackgroundDraft.jsx';
const livePath = 'web/src/components/chat/ChatBackground.jsx';

const draftContent = fs.readFileSync(draftPath, 'utf8');
let liveContent = fs.readFileSync(livePath, 'utf8');

const compRegex = /\/\* ── 3D ROSE PETALS ── \*\/([\s\S]*?)export default function ChatBackground/g;
const match = compRegex.exec(draftContent);

if (match && match[1]) {
  const newComponents = match[1];
  
  // 1. Insert components
  liveContent = liveContent.replace('export default function ChatBackground', newComponents + '\nexport default function ChatBackground');
  
  // 2. Insert switch cases
  const switchAdditions = `
    case '3d_petals': return <VelvetPetalsBackground />;
    case '3d_crystal_hearts': return <CrystalHeartsBackground />;
    case '3d_rings': return <GoldenBokehBackground />;
    case '3d_stars': return <MidnightStarsBackground />;
    case '3d_bubbles': return <OceanBubblesBackground />;
    case '3d_embers': return <FireplaceEmbersBackground />;
`;
  liveContent = liveContent.replace('default:', switchAdditions + '    default:');
  
  fs.writeFileSync(livePath, liveContent, 'utf8');
  console.log('Successfully updated ChatBackground.jsx');
} else {
  console.log('Could not find new components in draft.');
}
