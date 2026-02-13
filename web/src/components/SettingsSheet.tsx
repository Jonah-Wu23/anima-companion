import React from 'react';
import { Volume2, MonitorPlay, Trash2, AlertTriangle, Info, Settings2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet';
import { Switch } from '@/components/ui/Switch';
import { Button } from '@/components/ui/Button';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { useSessionStore } from '@/lib/store/sessionStore';

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
  
  const { clearSession } = useSessionStore();

  const handleClearHistory = () => {
    if (window.confirm('确定要清除所有会话记录吗？此操作无法撤销。\nAre you sure you want to clear all session history? This action cannot be undone.')) {
      clearSession();
      onClose();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-[2.5rem] p-0 border-t-0 bg-white/80 backdrop-blur-xl shadow-2xl">
        <div className="h-full flex flex-col w-full max-w-2xl mx-auto">
            {/* 顶部手柄 - 视觉提示 */}
            <div className="w-full flex justify-center pt-4 pb-2 flex-shrink-0">
                <div className="w-12 h-1.5 bg-gray-300/60 rounded-full" />
            </div>

            {/* 标题栏 */}
            <SheetHeader className="px-6 pb-6 text-left flex-shrink-0">
                <SheetTitle className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Settings2 className="w-6 h-6 text-slate-400" />
                    设置
                </SheetTitle>
                <SheetDescription className="text-slate-500 font-medium">
                    个性化你的陪伴体验
                </SheetDescription>
            </SheetHeader>

            {/* 滚动内容区 */}
            <div className="flex-1 overflow-y-auto px-6 pb-8 space-y-8">
                
                {/* 分组：语音与交互 */}
                <section className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">
                        语音与交互
                    </h3>
                    <div className="bg-white/50 backdrop-blur-sm rounded-3xl p-2 border border-white/40 shadow-sm">
                        
                        {/* 选项：自动播放 */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-100/50 last:border-0">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-blue-100/80 text-blue-600 rounded-2xl">
                                    <Volume2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-semibold text-slate-700">自动播放语音</div>
                                    <div className="text-xs text-slate-500 mt-0.5">收到回复时自动朗读</div>
                                </div>
                            </div>
                            <Switch checked={autoPlayVoice} onCheckedChange={toggleAutoPlay} />
                        </div>

                        {/* 选项：减弱动画 */}
                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-sky-100/80 text-sky-600 rounded-2xl">
                                    <MonitorPlay className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-semibold text-slate-700">减弱动画</div>
                                    <div className="text-xs text-slate-500 mt-0.5">减少界面动效与 3D 渲染</div>
                                </div>
                            </div>
                            <Switch checked={reducedMotion} onCheckedChange={toggleReducedMotion} />
                        </div>
                    </div>
                </section>

                {/* 分组：危险区域 */}
                <section className="space-y-4">
                     <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        危险区域
                     </h3>
                     <div className="bg-red-50/40 backdrop-blur-sm rounded-3xl p-5 border border-red-100/60">
                        <div className="flex items-center gap-4 mb-4">
                             <div className="p-2.5 bg-white text-red-500 rounded-2xl shadow-sm">
                                <Trash2 className="w-5 h-5" />
                             </div>
                             <div>
                                <h4 className="font-semibold text-red-900">清除所有数据</h4>
                                <p className="text-xs text-red-700/70 mt-0.5 leading-relaxed">
                                    将永久删除当前会话的所有记忆、聊天记录和关系进展。
                                </p>
                             </div>
                        </div>
                        
                        <Button 
                            variant="outline" 
                            className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 bg-white/60 h-11 rounded-xl font-medium"
                            onClick={handleClearHistory}
                        >
                            立即清除数据
                        </Button>
                     </div>
                </section>

                {/* 底部版权 */}
                <div className="flex flex-col items-center justify-center pt-4 pb-8 opacity-60">
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-100/50 rounded-full">
                        <Info className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-500">
                            Anima Companion v0.1.0
                        </span>
                    </div>
                </div>
            </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
