import re

def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Match the entire useEffect block carefully
    content = re.sub(r'useEffect\(\(\) => \{\s*const originalOverflow = document\.body\.style\.overflow;.*?document\.body\.style\.inset = \'\'; \};\s*\}, \[\]\);', '', content, flags=re.DOTALL)
    
    # Also strip the Chat.jsx version which is multiline
    chat_regex = r'useEffect\(\(\) => \{\s*const originalOverflow = document\.body\.style\.overflow;\s*document\.body\.style\.overflow = \'hidden\';\s*document\.body\.style\.position = \'fixed\';\s*document\.body\.style\.inset = \'0px\';\s*document\.body\.style\.width = \'100%\';\s*document\.body\.style\.height = \'100%\';\s*return \(\) => \{\s*document\.body\.style\.overflow = originalOverflow;\s*document\.body\.style\.width = \'\';\s*document\.body\.style\.position = \'\';\s*document\.body\.style\.inset = \'\';\s*\};\s*\}, \[\]\);'
    content = re.sub(chat_regex, '', content, flags=re.DOTALL)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

process_file('c:/projects/ros2/paxly-premium/web/src/pages/ai/AIAssistant.jsx')
process_file('c:/projects/ros2/paxly-premium/web/src/pages/chat/Chat.jsx')
