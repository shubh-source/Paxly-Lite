import re

with open('app/websocket/handler.py', 'r') as f:
    lines = f.readlines()

new_lines = []
in_loop = False
for line in lines:
    if line.startswith('                if p_type == "chat_message":'):
        new_lines.append('                try:\n')
        new_lines.append('    ' + line)
        in_loop = True
        continue

    if in_loop:
        if line.startswith('    except WebSocketDisconnect:'):
            in_loop = False
            new_lines.append('                except Exception as e:\n')
            new_lines.append('                    print(f"WS Handler Error: {e}")\n')
            new_lines.append('                    import traceback\n')
            new_lines.append('                    traceback.print_exc()\n\n')
            new_lines.append(line)
        elif line.strip() == '':
            new_lines.append(line)
        else:
            new_lines.append('    ' + line)
    else:
        new_lines.append(line)

with open('app/websocket/handler.py', 'w') as f:
    f.writelines(new_lines)
