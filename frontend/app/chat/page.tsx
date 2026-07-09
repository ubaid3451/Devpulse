"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import AppLayout from "@/components/AppLayout";
import EmojiPicker from "emoji-picker-react";
import { 
  getConversations, 
  ConversationResponse, 
  getChatHistory, 
  ChatMessageResponse,
  searchUsers,
  AuthorResponse,
  getOnlineUsers,
  uploadChatImage
} from "@/lib/api";

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUser = searchParams.get("user");
  const { user: currentUser } = useAuth();
  
  const [conversations, setConversations] = useState<ConversationResponse[]>([]);
  const [activeUser, setActiveUser] = useState<string | null>(initialUser);
  const [messages, setMessages] = useState<ChatMessageResponse[]>([]);
  const [inputText, setInputText] = useState("");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AuthorResponse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachedImage, setAttachedImage] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ws = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getConversations().then(data => {
      setConversations(data);
    }).catch(err => console.error("Failed to load conversations", err));
  }, []);

  useEffect(() => {
    if (activeUser) {
      getChatHistory(activeUser).then(data => {
        setMessages(data);
      }).catch(err => console.error("Failed to load history", err));
    } else {
      setMessages([]);
    }
  }, [activeUser]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    const delayDebounceFn = setTimeout(() => {
      searchUsers(searchQuery).then(data => {
        setSearchResults(data);
      }).catch(err => console.error("Failed to search users", err))
        .finally(() => setIsSearching(false));
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!currentUser) return;
    
    getOnlineUsers()
      .then(users => setOnlineUsers(new Set(users)))
      .catch(err => console.error("Failed to get online users", err));
    
    const wsUrl = process.env.NEXT_PUBLIC_API_URL?.replace("http", "ws") || "ws://localhost:8000";
    const socket = new WebSocket(`${wsUrl}/chat/ws`);
    
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "presence") {
        setOnlineUsers(prev => {
          const next = new Set(prev);
          if (msg.online) next.add(msg.user_id);
          else next.delete(msg.user_id);
          return next;
        });
      } else if (msg.type === "chat_message") {
        setMessages(prev => [...prev, msg]);
        getConversations().then(setConversations);
      } else if (msg.type === "reaction_update") {
        setMessages(prev => prev.map(m => m.id === msg.message_id ? { ...m, reactions: msg.reactions } : m));
      }
    };
    
    ws.current = socket;
    
    return () => {
      socket.close();
    };
  }, [currentUser]);

  const sendMessage = async () => {
    if ((!inputText.trim() && !attachedImage) || !activeUser || !ws.current || isUploading) return;
    
    setIsUploading(true);
    let imageUrl = null;
    try {
      if (attachedImage) {
        const res = await uploadChatImage(attachedImage);
        imageUrl = res.image_url;
      }
      
      const payload = {
        receiver_username: activeUser,
        content: inputText.trim(),
        image_url: imageUrl
      };
      
      ws.current.send(JSON.stringify(payload));
      setInputText("");
      setAttachedImage(null);
      setShowEmojiPicker(false);
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setIsUploading(false);
    }
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    if (!ws.current) return;
    ws.current.send(JSON.stringify({
      type: "reaction",
      message_id: messageId,
      emoji: emoji
    }));
    setActiveReactionMsgId(null);
  };

  const insertTextAtCursor = (prefix: string, suffix: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = inputText;
    
    const selectedText = text.substring(start, end) || "text";
    const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
    
    setInputText(newText);
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  };

  const activeConversationInfo = conversations.find(c => c.username === activeUser) 
    || searchResults.find(u => u.username === activeUser)
    || { id: "", username: activeUser, full_name: activeUser, avatar_url: null };

  return (
    <AppLayout activeNav="messages">
      <div className="flex flex-1 overflow-hidden bg-surface text-on-surface w-full h-full">
        {/* Conversations Sidebar */}
        <div className="w-[320px] shrink-0 border-r border-outline-variant flex flex-col bg-[#111318]">
          <div className="p-4 flex items-center justify-between border-b border-outline-variant/30">
            <h2 className="font-headline-sm text-headline-sm font-bold">Chats</h2>
            <button className="text-primary hover:bg-primary/10 p-2 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-[20px]">edit_square</span>
            </button>
          </div>
          
          <div className="px-4 py-3">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
              <input 
                type="text" 
                placeholder="Search developers..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#1e2025] border border-outline-variant/50 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {searchQuery.trim() ? (
              // Search Results
              isSearching ? (
                <div className="p-4 text-center text-on-surface-variant text-sm">Searching...</div>
              ) : searchResults.length > 0 ? (
                searchResults.map(user => (
                  <div 
                    key={user.id}
                    onClick={() => {
                      setActiveUser(user.username);
                      setSearchQuery("");
                    }}
                    className={`p-3 mx-2 my-1 rounded-lg cursor-pointer transition-colors flex items-center gap-3 ${activeUser === user.username ? "bg-[#1e2025]" : "hover:bg-[#1e2025]/50"}`}
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-variant shrink-0 border border-outline-variant/30">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold">
                          {user.full_name?.substring(0,2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{user.full_name}</div>
                      <div className="text-[12px] text-primary">@{user.username}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-on-surface-variant text-sm">No users found.</div>
              )
            ) : (
              // Conversations
              <>
                {conversations.map(conv => (
                  <div 
                    key={conv.id}
                    onClick={() => setActiveUser(conv.username)}
                    className={`p-3 mx-2 my-1 rounded-lg cursor-pointer transition-colors flex items-center gap-3 ${activeUser === conv.username ? "bg-[#1e2025]" : "hover:bg-[#1e2025]/50"}`}
                  >
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-variant shrink-0 border border-outline-variant/30">
                        {conv.avatar_url ? (
                          <img src={conv.avatar_url} alt={conv.username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold">
                            {conv.full_name.substring(0,2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      {/* Online dot indicator */}
                      {onlineUsers.has(conv.id) && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#111318]"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <div className="font-bold text-sm truncate">{conv.full_name}</div>
                        <div className="text-[11px] text-on-surface-variant">2m</div>
                      </div>
                      <div className="text-[13px] text-on-surface-variant truncate opacity-80">{conv.last_message}</div>
                    </div>
                  </div>
                ))}
                {conversations.length === 0 && (
                  <div className="p-8 text-center text-on-surface-variant text-sm">
                    No conversations yet.
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-[#0b0d10] relative min-w-0">
          {activeUser ? (
            <>
              {/* Chat Header */}
              <div className="h-16 px-6 border-b border-outline-variant/30 flex justify-between items-center bg-[#0b0d10]/95 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-variant shrink-0">
                    {activeConversationInfo?.avatar_url ? (
                      <img src={activeConversationInfo.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold">
                        {activeConversationInfo?.full_name?.substring(0,2).toUpperCase() || activeUser.substring(0,2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-bold">{activeConversationInfo?.full_name || activeUser}</div>
                    {onlineUsers.has(activeConversationInfo?.id as string) && (
                      <div className="text-[12px] text-green-500 font-medium">Online</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-on-surface-variant">
                  <button onClick={() => alert("Audio calls coming soon!")} className="hover:text-primary transition-colors"><span className="material-symbols-outlined text-[22px]">call</span></button>
                  <button onClick={() => alert("Video calls coming soon!")} className="hover:text-primary transition-colors"><span className="material-symbols-outlined text-[22px]">videocam</span></button>
                  <button onClick={() => alert("Info panel coming soon!")} className="hover:text-primary transition-colors"><span className="material-symbols-outlined text-[22px]">info</span></button>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                <div className="text-center text-[12px] text-on-surface-variant/50 relative mb-4">
                  <span className="bg-[#0b0d10] px-3 relative z-10">Today</span>
                  <div className="absolute top-1/2 left-0 w-full h-[1px] bg-outline-variant/20"></div>
                </div>
                
                {messages.map((msg, idx) => {
                  const isMine = msg.sender_id === currentUser?.id;
                  const showAvatar = !isMine && (idx === 0 || messages[idx-1].sender_id !== msg.sender_id);
                  
                  return (
                    <div key={msg.id} className={`flex gap-3 ${isMine ? "justify-end" : "justify-start"}`}>
                      {!isMine && (
                        <div className="w-8 h-8 shrink-0 mt-auto">
                          {showAvatar && (
                             <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-variant">
                               {activeConversationInfo?.avatar_url ? (
                                 <img src={activeConversationInfo.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                               ) : (
                                 <div className="w-full h-full flex items-center justify-center text-xs font-bold">
                                   {activeConversationInfo?.full_name?.substring(0,2).toUpperCase() || "U"}
                                 </div>
                               )}
                             </div>
                          )}
                        </div>
                      )}
                      
                      <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} max-w-[70%] group`}>
                        <div className="flex items-center gap-2">
                          {isMine && (
                            <button 
                              onClick={() => setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-on-surface transition-opacity"
                            >
                              <span className="material-symbols-outlined text-[16px]">add_reaction</span>
                            </button>
                          )}
                          <div 
                            className={`px-4 py-2.5 rounded-2xl relative ${
                              isMine 
                                ? "bg-[#71d4ff] text-[#003548] rounded-br-sm" 
                                : "bg-[#1e2025] text-on-surface border border-outline-variant/20 rounded-bl-sm"
                            }`}
                          >
                            {msg.image_url && (
                              <img src={msg.image_url} alt="Attachment" className="max-w-full rounded-lg mb-2 max-h-64 object-cover" />
                            )}
                            {msg.content && <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</div>}
                          </div>
                          {!isMine && (
                            <button 
                              onClick={() => setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-on-surface transition-opacity"
                            >
                              <span className="material-symbols-outlined text-[16px]">add_reaction</span>
                            </button>
                          )}
                        </div>
                        
                        {/* Reaction Picker Popover */}
                        {activeReactionMsgId === msg.id && (
                          <div className={`absolute z-20 ${isMine ? 'right-12' : 'left-12'} mt-1`}>
                            <EmojiPicker 
                              onEmojiClick={(e) => toggleReaction(msg.id, e.emoji)} 
                              theme="dark" 
                              lazyLoadEmojis={true} 
                            />
                          </div>
                        )}
                        
                        {/* Render Reactions */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? "justify-end" : "justify-start"}`}>
                            {Array.from(new Set(msg.reactions.map(r => r.emoji))).map(emoji => {
                              const count = msg.reactions!.filter(r => r.emoji === emoji).length;
                              const hasReacted = msg.reactions!.some(r => r.emoji === emoji && r.user_id === currentUser?.id);
                              return (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(msg.id, emoji)}
                                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border ${hasReacted ? 'bg-[#71d4ff]/20 border-[#71d4ff]/50' : 'bg-[#1e2025] border-outline-variant/30 hover:bg-[#1e2025]/80'}`}
                                >
                                  <span>{emoji}</span>
                                  <span className={hasReacted ? 'text-[#71d4ff]' : 'text-on-surface-variant'}>{count}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="text-[11px] mt-1.5 text-on-surface-variant flex items-center gap-1">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {isMine && <span className="material-symbols-outlined text-[14px]">done_all</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-4 bg-[#0b0d10] border-t border-outline-variant/20">
                <div className="bg-[#111318] border border-outline-variant/40 rounded-xl overflow-hidden focus-within:border-primary/50 transition-colors">
                  <div className="px-3 py-2 border-b border-outline-variant/20 flex gap-2 text-on-surface-variant relative">
                    <button onClick={() => insertTextAtCursor("**", "**")} className="hover:text-on-surface p-1 rounded hover:bg-surface-variant/50 transition-colors font-bold text-sm">B</button>
                    <button onClick={() => insertTextAtCursor("*", "*")} className="hover:text-on-surface p-1 rounded hover:bg-surface-variant/50 transition-colors font-bold text-sm italic">I</button>
                    <button onClick={() => insertTextAtCursor("`", "`")} className="hover:text-on-surface p-1 rounded hover:bg-surface-variant/50 transition-colors text-sm">&lt; &gt;</button>
                    <button onClick={() => insertTextAtCursor("[", "](url)")} className="hover:text-on-surface p-1 rounded hover:bg-surface-variant/50 transition-colors"><span className="material-symbols-outlined text-[16px]">link</span></button>
                    <button 
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="hover:text-on-surface p-1 rounded hover:bg-surface-variant/50 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">sentiment_satisfied</span>
                    </button>
                    
                    {showEmojiPicker && (
                      <div className="absolute bottom-full left-0 mb-2 z-30">
                        <EmojiPicker 
                          onEmojiClick={(e) => setInputText(prev => prev + e.emoji)} 
                          theme="dark" 
                        />
                      </div>
                    )}
                  </div>
                  
                  {attachedImage && (
                    <div className="px-4 py-2 bg-surface-variant/20 border-b border-outline-variant/20 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-primary truncate">
                        <span className="material-symbols-outlined text-[18px]">image</span>
                        {attachedImage.name}
                      </div>
                      <button onClick={() => setAttachedImage(null)} className="text-on-surface-variant hover:text-red-400">
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    </div>
                  )}

                  <div className="flex items-end p-2 gap-2">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/*"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          setAttachedImage(e.target.files[0]);
                        }
                      }}
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 rounded-lg transition-colors"
                    >
                      <span className="material-symbols-outlined">attach_file</span>
                    </button>
                    <textarea 
                      ref={textareaRef}
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder="Write a message or paste code..."
                      className="flex-1 bg-transparent border-none resize-none max-h-32 min-h-[44px] py-3 focus:outline-none focus:ring-0 text-[15px]"
                      rows={1}
                    />
                    <button 
                      onClick={sendMessage}
                      disabled={(!inputText.trim() && !attachedImage) || isUploading}
                      className="p-3 bg-[#71d4ff] text-[#003548] rounded-lg disabled:opacity-50 hover:brightness-110 transition-colors shrink-0 mb-1"
                    >
                      <span className="material-symbols-outlined text-[20px]">{isUploading ? 'hourglass_empty' : 'send'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant/50">
              <span className="material-symbols-outlined text-[80px] mb-6 opacity-30">forum</span>
              <p className="text-title-lg font-medium">Select a conversation to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
