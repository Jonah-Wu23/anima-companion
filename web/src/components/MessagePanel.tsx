import React, { useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { useSessionStore } from '@/lib/store/sessionStore';
import { usePipelineStore } from '@/lib/store/pipelineStore';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';
import { Sparkles, MessageSquare, Mic, Smile } from 'lucide-react';
import { api } from '@/lib/api/client';

const DEFAULT_PERSONA_ID = process.env.NEXT_PUBLIC_DEFAULT_PERSONA_ID || 'phainon';

function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function MessagePanel() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const messages = useSessionStore((state) => state.messages);
  const addMessage = useSessionStore((state) => state.addMessage);
  const pipelineStage = usePipelineStore((state) => state.stage);
  const setStage = usePipelineStore((state) => state.setStage);
  const setError = usePipelineStore((state) => state.setError);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or stage change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pipelineStage]);

  const isTyping = pipelineStage === 'processing';
  const isBusy = pipelineStage === 'processing' || pipelineStage === 'uploading' || pipelineStage === 'recording';

  const handleQuickPrompt = useCallback(async (text: string) => {
    if (!text.trim() || isBusy) return;

    addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    });

    setStage('processing');
    try {
      const response = await api.chatText({
        session_id: sessionId,
        persona_id: DEFAULT_PERSONA_ID,
        user_text: text,
      });

      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.assistant_text,
        createdAt: Date.now(),
        emotion: response.emotion,
      });
      setStage('idle');
    } catch (error) {
      setError(extractApiErrorMessage(error, '发送失败，请重试'));
      setStage('error');
    }
  }, [addMessage, isBusy, sessionId, setError, setStage]);

  return (
    <div className="relative flex flex-col h-full w-full overflow-hidden bg-transparent">
      {/* Top Fade Mask */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/80 to-transparent z-10" />

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth pb-24" ref={scrollRef}>
        {/* Empty State */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] space-y-8 animate-in fade-in duration-500">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-400 blur-2xl opacity-20 rounded-full animate-pulse" />
              <div className="relative bg-white p-4 rounded-2xl shadow-sm border border-blue-50">
                <Sparkles className="w-8 h-8 text-blue-500" />
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <h3 className="text-lg font-medium text-slate-800">开始与白厄的对话</h3>
              <p className="text-sm text-slate-500 max-w-[240px]">
                我可以陪你聊天、讲故事，或者只是安静地听你说。
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2 max-w-[320px]">
              {[
                { icon: MessageSquare, text: "今天心情怎么样？" },
                { icon: Mic, text: "讲个温暖的小故事" },
                { icon: Smile, text: "陪我聊聊今天吧" },
              ].map((chip, i) => (
                <button
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 rounded-full text-xs text-slate-600 transition-colors shadow-sm"
                  onClick={() => void handleQuickPrompt(chip.text)}
                  disabled={isBusy}
                >
                  <chip.icon className="w-3 h-3" />
                  {chip.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message List */}
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          
          return (
            <div
              key={msg.id}
              className={cn(
                "flex w-full animate-in fade-in slide-in-from-bottom-4 duration-500",
                isUser ? "justify-end" : "justify-start"
              )}
            >
              <div className={cn(
                "flex max-w-[85%] md:max-w-[75%] gap-3 group",
                isUser ? "flex-row-reverse" : "flex-row"
              )}>
                {/* Avatar */}
                <Avatar className="w-8 h-8 mt-1 border border-white shadow-sm">
                  {!isUser && <AvatarImage src="/assets/avatar-placeholder.svg" alt="白厄头像" />}
                  <AvatarFallback className={isUser ? "bg-blue-100 text-blue-600" : "bg-pink-100 text-pink-600"}>
                    {isUser ? "你" : "白"}
                  </AvatarFallback>
                </Avatar>

                <div className={cn(
                  "flex flex-col gap-1",
                  isUser ? "items-end" : "items-start"
                )}>
                  {/* Name & Emotion Badge (Assistant only) */}
                  {!isUser && (
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs font-medium text-slate-500">白厄</span>
                      {msg.emotion && msg.emotion !== 'neutral' && (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-100">
                          <Smile className="w-3 h-3" />
                          {msg.emotion}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div
                    className={cn(
                      "relative px-4 py-2.5 text-sm leading-relaxed shadow-sm break-words",
                      isUser 
                        ? "bg-gradient-to-br from-sky-400 to-amber-400 text-white rounded-2xl rounded-br-sm" 
                        : "bg-white/80 backdrop-blur-md border border-white/40 text-slate-700 rounded-2xl rounded-tl-sm"
                    )}
                  >
                    {msg.content}
                  </div>
                  
                  {/* Timestamp */}
                  <span className="text-[10px] text-slate-400 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex w-full justify-start animate-in fade-in slide-in-from-bottom-4 duration-300">
             <div className="flex max-w-[85%] gap-3 flex-row">
                <Avatar className="w-8 h-8 mt-1 border border-white shadow-sm">
                  <AvatarImage src="/assets/avatar-placeholder.svg" alt="白厄头像" />
                  <AvatarFallback className="bg-pink-100 text-pink-600">白</AvatarFallback>
                </Avatar>
                
                <div className="flex flex-col gap-1 items-start">
                  <div className="flex items-center gap-2 px-1">
                     <span className="text-xs font-medium text-slate-500">白厄</span>
                     <span className="text-[10px] text-slate-400">正在思考...</span>
                  </div>
                  <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                    <div className="flex space-x-1.5 items-center h-4">
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                    </div>
                  </div>
                </div>
             </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-px w-full" />
      </div>
    </div>
  );
}
