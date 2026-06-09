import re
with open('c:/projects/ros2/paxly-premium/web/src/pages/chat/Chat.jsx', 'r', encoding='utf-8', errors='ignore') as f:
    c = f.read()
c = re.sub(r'dY"? Image', '📷 Image', c)
c = re.sub(r'dYZ? Video', '🎥 Video', c)
c = re.sub(r'dYZ? Voice Note', '🎵 Voice Note', c)
with open('c:/projects/ros2/paxly-premium/web/src/pages/chat/Chat.jsx', 'w', encoding='utf-8') as f:
    f.write(c)
