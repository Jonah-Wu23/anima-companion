import React, { useEffect, useRef } from 'react';
import { useSessionStore } from '@/lib/store/sessionStore';
import { usePipelineStore } from '@/lib/store/pipelineStore';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export function MessagePanel() {
  const messages = useSessionStore((state) => state.messages);
  const pipelineStage = usePipelineStore((state) => state.stage);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change or pipeline stage updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pipelineStage]);

  return (
    <div className="flex-1 w-full overflow-y-auto p-4 space-y-4 scroll-smooth">
      {/* Welcome Message Placeholder if empty */}
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2">
          <p className="text-sm">与白厄开始对话...</p>
        </div>
      )}

      {/* Message List */}
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        return (
          <div
            key={msg.id}
            className={cn(
              "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
              isUser ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm break-words",
                isUser 
                  ? "bg-blue-600 text-white rounded-br-sm" 
                  : "bg-white border border-gray-100 text-slate-800 rounded-bl-sm"
              )}
            >
              {msg.content}
            </div>
          </div>
        );
      })}

      {/* Pipeline Status Indicator (Thinking/Processing) */}
      {(pipelineStage === 'processing' || pipelineStage === 'uploading') && (
        <div className="flex w-full justify-start animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span className="text-xs text-gray-500">Thinking...</span>
          </div>
        </div>
      )}

      {/* Invisible anchor for scrolling */}
      <div ref={bottomRef} className="h-px w-full" />
    </div>
  );
}
