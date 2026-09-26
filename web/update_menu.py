import re

with open('c:/projects/ros2/paxly-premium/web/src/pages/chat/Chat.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update handleContextMenu
code = code.replace(
    'setContextMenuMsg({ msg, x: e.clientX, y: e.clientY });',
    'setContextMenuMsg({ msg, x: e.clientX, y: e.clientY, type: "options" });'
)

# 2. Update Icons.Smile onClick
code = code.replace(
    'onClick={(e) => setContextMenuMsg({ msg, x: e.clientX, y: e.clientY })} style={{ background:\'transparent\', border:\'none\', color:\'var(--muted)\', cursor:\'pointer\' }}><Icons.Smile',
    'onClick={(e) => setContextMenuMsg({ msg, x: e.clientX, y: e.clientY, type: "emoji" })} style={{ background:\'transparent\', border:\'none\', color:\'var(--muted)\', cursor:\'pointer\' }}><Icons.Smile'
)

# 3. Update Icons.MoreVertical onClick
code = code.replace(
    'onClick={(e) => setContextMenuMsg({ msg, x: e.clientX, y: e.clientY })} style={{ background:\'transparent\', border:\'none\', color:\'var(--muted)\', cursor:\'pointer\' }}><Icons.MoreVertical',
    'onClick={(e) => setContextMenuMsg({ msg, x: e.clientX, y: e.clientY, type: "options" })} style={{ background:\'transparent\', border:\'none\', color:\'var(--muted)\', cursor:\'pointer\' }}><Icons.MoreVertical'
)

# 4. Replace the context menu rendering
pattern = re.compile(r'\{\/\* Reactions Row \*\/.*?(?=\s*\{\/\* Delete Confirmation Modal \*\/)', re.DOTALL)

new_menu = '''{(!contextMenuMsg.type || contextMenuMsg.type === 'emoji') && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', gap: 8 }}>
                    {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                      <span 
                        key={emoji} 
                        style={{ fontSize: '1.4rem', cursor: 'pointer', padding: 4, transition: 'transform 0.1s' }}
                        onClick={() => {
                          wsService.send({ type: 'reaction', message_id: contextMenuMsg.msg.id, emoji });
                          setContextMenuMsg(null);
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      >{emoji}</span>
                    ))}
                  </div>
                )}

                {contextMenuMsg.type === 'options' && (
                  <>
                    {[
                      { icon: <Icons.Reply size={18} />, label: 'Reply', action: () => { setReplyingTo(contextMenuMsg.msg); setContextMenuMsg(null); } },
                      { icon: <Icons.Copy size={18} />, label: 'Copy', action: () => { navigator.clipboard.writeText(contextMenuMsg.msg.text); setContextMenuMsg(null); } },
                      { icon: <Icons.Edit size={18} />, label: 'Edit', action: () => { alert('Editing coming soon!'); setContextMenuMsg(null); } },
                      { icon: <Icons.Pin size={18} />, label: 'Pin to Chat', action: () => { alert('Pinning coming soon!'); setContextMenuMsg(null); } },
                      { icon: <Icons.Vault size={18} />, label: 'Save to Vault', action: () => { alert('Saved to Memory Vault!'); setContextMenuMsg(null); } },
                      { icon: <span style={{ fontSize: '1.2rem' }}>✨</span>, label: 'Ask Aura', action: () => { alert('Aura is analyzing this message...'); setContextMenuMsg(null); } },
                    ].map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', color: item.label === 'Ask Aura' ? 'var(--accent)' : '#fff', fontWeight: item.label === 'Ask Aura' ? 700 : 400, cursor: 'pointer', fontSize: '0.95rem' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={item.action}>
                        {item.label}
                        <div style={{ opacity: item.label === 'Ask Aura' ? 1 : 0.7, filter: item.label === 'Ask Aura' ? 'drop-shadow(0 0 5px rgba(201,169,110,0.5))' : 'none' }}>{item.icon}</div>
                      </div>
                    ))}
                    
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />
                    
                    {contextMenuMsg.msg.sender_id === user?.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', color: '#ff4444', cursor: 'pointer', fontSize: '0.95rem' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,68,68,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={() => {
                          setDeleteModalMsg(contextMenuMsg.msg);
                          setContextMenuMsg(null);
                        }}>
                        Delete
                        <div style={{ opacity: 0.7 }}><Icons.Trash size={18} /></div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', color: '#ff4444', cursor: 'pointer', fontSize: '0.95rem' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,68,68,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={() => { alert('Reported!'); setContextMenuMsg(null); }}>
                        Report
                        <div style={{ opacity: 0.7 }}><Icons.Report size={18} /></div>
                      </div>
                    )}
                  </>
                )}
              </div>
'''

code = pattern.sub(new_menu, code)

with open('c:/projects/ros2/paxly-premium/web/src/pages/chat/Chat.jsx', 'w', encoding='utf-8') as f:
    f.write(code)
