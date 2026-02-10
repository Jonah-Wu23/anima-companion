import React from 'react';
import { X, Trash2, Volume2, MonitorPlay, AlertTriangle } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { useSessionStore } from '@/lib/store/sessionStore';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsSheet({ isOpen, onClose }: SettingsSheetProps) {
  const { 
    autoPlayVoice, 
    reducedMotion, 
    toggleAutoPlay, 
    toggleReducedMotion 
  } = useSettingsStore();

  const { sessionId, clearSession: clearLocalSession } = useSessionStore();

  const handleClearSession = async () => {
    if (confirm('确定要清除所有对话记录吗？此操作无法撤销。')) {
      try {
        // Clear remote session
        await api.clearSession({ session_id: sessionId });
      } catch (error) {
        console.error('Failed to clear remote session:', error);
        // Continue to clear local session anyway
      }
      
      // Clear local session
      clearLocalSession();
      
      // Close settings and maybe reload to reset state cleanly
      onClose();
      window.location.reload();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Sheet / Modal */}
      <div className={cn(
        "relative w-full md:w-[480px] bg-white md:rounded-2xl rounded-t-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]",
        "animate-slide-up"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-slate-800">设置</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6 overflow-y-auto">
          
          {/* Section: Preferences */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">偏好设置</h3>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium text-slate-700">自动播放语音</div>
                  <div className="text-xs text-gray-500">收到回复时自动朗读</div>
                </div>
              </div>
              <Switch checked={autoPlayVoice} onCheckedChange={toggleAutoPlay} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                  <MonitorPlay className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium text-slate-700">减弱动画</div>
                  <div className="text-xs text-gray-500">减少界面动效与 3D 渲染</div>
                </div>
              </div>
              <Switch checked={reducedMotion} onCheckedChange={toggleReducedMotion} />
            </div>
          </div>

          {/* Section: Danger Zone */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> 危险区域
            </h3>
            
            <div className="bg-red-50 rounded-xl p-4 border border-red-100">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-white rounded-lg text-red-500 shadow-sm">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium text-red-900">清除所有数据</div>
                  <div className="text-xs text-red-700 mt-1">
                    将删除当前会话的所有记忆、聊天记录和关系进展。此操作不可逆。
                  </div>
                </div>
              </div>
              
              <Button 
                variant="danger" 
                className="w-full justify-center bg-red-600 hover:bg-red-700 text-white"
                onClick={handleClearSession}
              >
                清除当前会话数据
              </Button>
            </div>
          </div>
          
          <div className="text-center text-xs text-gray-300 py-2">
            Anima Companion v0.1.0
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple Switch Component for internal use
function Switch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onCheckedChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-blue-500" : "bg-gray-200"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}
