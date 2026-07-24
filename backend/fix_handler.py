import re

with open('app/websocket/handler.py', 'r') as f:
    content = f.read()

# Add try-except inside while True:
target_start = '                p_type = payload.get("type")\n'
replacement = '''                p_type = payload.get("type")
                try:
'''

content = content.replace(target_start, replacement)

# Indent all lines from `if p_type == "chat_message":` to the end of the loop
lines = content.split('\n')
in_loop = False
new_lines = []
for line in lines:
    if line.startswith('                if p_type == "chat_message":'):
        in_loop = True
        
    if in_loop and line.startswith('            except WebSocketDisconnect:'):
        in_loop = False
        new_lines.append('                except Exception as e:')
        new_lines.append('                    print(f"WS Handler Error: {e}")')
        new_lines.append('                    import traceback')
        new_lines.append('                    traceback.print_exc()')
        new_lines.append(line)
        continue
        
    if in_loop and len(line) > 0:
        new_lines.append('    ' + line)
    else:
        new_lines.append(line)

with open('app/websocket/handler.py', 'w') as f:
    f.write('\n'.join(new_lines))
