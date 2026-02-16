'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Send, Mic, Settings, XCircle, Volume2, VolumeX, AudioWaveform } from 'lucide-react';
import { useSessionStore } from '@/lib/store/sessionStore';
import { usePipelineStore, type InputMode, type VADStatus } from '@/lib/store/pipelineStore';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { useAvatarStore } from '@/lib/store/avatarStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import VipModal from '@/components/VipModal';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import type { Animation, ChatTextVoiceResponse, Emotion } from '@/lib/api/types';
import { VADRecorder } from '@/lib/audio/vad-recorder';
import { TouchFeedback, TouchFeedbackStyles } from '@/components/interaction/TouchFeedback';

// ============================================================================
// Types & Constants
// ============================================================================

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
  __testLipSync?: (energy?: number) => number;
};

const DEFAULT_PERSONA_ID = process.env.NEXT_PUBLIC_DEFAULT_PERSONA_ID || 'phainon';
const REQUIRED_TTS_PROVIDER = 'qwen_clone_tts';
const DEFAULT_QWEN_VOICE_ID = (process.env.NEXT_PUBLIC_QWEN_VOICE_ID || '').trim();
const DEFAULT_QWEN_TARGET_MODEL = (process.env.NEXT_PUBLIC_QWEN_TARGET_MODEL || '').trim();
const PRESS_TO_TALK_MIN_RELEASE_MS = 250;

const VOICE_MODE_LABELS: Record<InputMode, { label: string; desc: string; icon: React.ReactNode }> = {
  text: { 
    label: '文本', 
    desc: '输入文字对话',
    icon: <span className="text-xs">T</span>
  },
  'push-to-talk': { 
    label: '按键', 
    desc: '按住麦克风说话',
    icon: <Mic className="w-3 h-3" />
  },
  vad: { 
    label: 'VAD', 
    desc: '直接说话自动识别',
    icon: <AudioWaveform className="w-3 h-3" />
  },
};

const VAD_STATUS_CONFIG: Record<VADStatus, { color: string; glow: string; label: string }> = {
  idle: { color: 'bg-slate-400', glow: 'shadow-slate-400/30', label: '待机中' },
  listening: { color: 'bg-sky-400', glow: 'shadow-sky-400/40', label: '倾听中' },
  speaking: { color: 'bg-amber-400', glow: 'shadow-amber-400/40', label: '聆听中' },
  processing: { color: 'bg-violet-400', glow: 'shadow-violet-400/40', label: '处理中' },
};

// ============================================================================
// Utility Functions
// ============================================================================

function mergeToMono(audioBuffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = audioBuffer;
  if (numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }

  const mono = new Float32Array(length);
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      mono[index] += channelData[index] / numberOfChannels;
    }
  }
  return mono;
}

function resampleLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) {
    return samples;
  }

  const ratio = fromRate / toRate;
  const targetLength = Math.max(1, Math.round(samples.length / ratio));
  const result = new Float32Array(targetLength);

  for (let index = 0; index < targetLength; index += 1) {
    const sourceIndex = index * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, samples.length - 1);
    const mix = sourceIndex - left;
    result[index] = samples[left] * (1 - mix) + samples[right] * mix;
  }
  return result;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

async function convertAudioBlobToWav16k(blob: Blob): Promise<Blob> {
  const AudioContextCtor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error('当前浏览器不支持 AudioContext，无法转换录音');
  }

  const source = await blob.arrayBuffer();
  const audioContext = new AudioContextCtor();
  try {
    const decoded = await audioContext.decodeAudioData(source.slice(0));
    const mono = mergeToMono(decoded);
    const resampled = resampleLinear(mono, decoded.sampleRate, 16000);
    const wav = encodeWavPcm16(resampled, 16000);
    return new Blob([wav], { type: 'audio/wav' });
  } finally {
    await audioContext.close();
  }
}

function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail.map((item) => JSON.stringify(item)).join('; ');
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * 波形动画组件 - 根据音频能量显示动态波形
 */
interface WaveformVisualizerProps {
  energy: number;
  isActive: boolean;
  mode: 'vad' | 'recording';
  barCount?: number;
}

function WaveformVisualizer({ energy, isActive, mode, barCount = 24 }: WaveformVisualizerProps) {
  const bars = useMemo(() => {
    return Array.from({ length: barCount }, (_, i) => {
      // 基础高度
      const baseHeight = 20;
      // 根据能量和位置计算动态高度
      const energyFactor = isActive ? energy * 80 : 0;
      const positionWave = Math.sin((Date.now() / 200) + (i * 0.3)) * 10;
      const height = baseHeight + energyFactor + (isActive ? positionWave : 0);
      return Math.max(4, Math.min(100, height));
    });
  }, [energy, isActive, barCount]);

  const colorClass = mode === 'vad' 
    ? 'bg-gradient-to-t from-sky-400 to-cyan-300' 
    : 'bg-gradient-to-t from-amber-400 to-orange-300';

  return (
    <div className="flex items-end justify-center gap-[2px] h-12 px-4">
      {bars.map((height, i) => (
        <div
          key={i}
          className={cn(
            "w-1 rounded-full transition-all duration-150",
            colorClass,
            isActive && "animate-pulse"
          )}
          style={{
            height: `${height}%`,
            opacity: isActive ? 0.8 + (energy * 0.2) : 0.3,
            transitionDelay: `${i * 20}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * VAD状态指示器 - 显示当前VAD状态和脉冲动画
 */
interface VADStatusIndicatorProps {
  status: VADStatus;
  size?: 'sm' | 'md' | 'lg';
}

function VADStatusIndicator({ status, size = 'md' }: VADStatusIndicatorProps) {
  const config = VAD_STATUS_CONFIG[status];
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  return (
    <div className="relative flex items-center justify-center">
      {/* 外圈脉冲 */}
      {status !== 'idle' && (
        <div
          className={cn(
            "absolute rounded-full animate-ping opacity-30",
            config.color,
            size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-6 h-6' : 'w-8 h-8'
          )}
        />
      )}
      {/* 内圈实心 */}
      <div
        className={cn(
          "rounded-full transition-colors duration-300",
          config.color,
          sizeClasses[size]
        )}
      />
    </div>
  );
}

/**
 * 模式切换按钮组 - 带图标和描述
 */
interface ModeSelectorProps {
  currentMode: InputMode;
  onModeChange: (mode: InputMode) => void;
  disabled?: boolean;
}

function ModeSelector({ currentMode, onModeChange, disabled }: ModeSelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/70 p-1.5 border border-white/60 shadow-sm backdrop-blur-sm">
      {(['text', 'push-to-talk', 'vad'] as InputMode[]).map((mode) => {
        const config = VOICE_MODE_LABELS[mode];
        const isActive = currentMode === mode;
        
        return (
          <button
            key={mode}
            type="button"
            disabled={disabled}
            onClick={() => onModeChange(mode)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300',
              isActive
                ? 'bg-slate-900 text-white shadow-md scale-105'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/80'
            )}
            title={config.desc}
          >
            {config.icon}
            <span>{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 录音按钮 - 带涟漪效果和状态反馈
 */
interface RecordButtonProps {
  isRecording: boolean;
  isCanceling: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  onTouchTrackStart?: (e: React.TouchEvent) => void;
  onTouchTrackMove?: (e: React.TouchEvent) => void;
  onTouchTrackEnd?: () => void;
  disabled?: boolean;
}

function RecordButton({ 
  isRecording, 
  isCanceling, 
  onStart, 
  onStop, 
  onCancel,
  onTouchTrackStart,
  onTouchTrackMove,
  onTouchTrackEnd,
  disabled 
}: RecordButtonProps) {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const ignoreMouseUntilRef = useRef(0);

  const addRipple = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!buttonRef.current) return;
    
    const rect = buttonRef.current.getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const id = Date.now();
    
    setRipples(prev => [...prev, { id, x, y }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 600);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (Date.now() < ignoreMouseUntilRef.current) {
      return;
    }
    addRipple(e);
    onStart();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    ignoreMouseUntilRef.current = Date.now() + 800;
    addRipple(e);
    onTouchTrackStart?.(e);
    onStart();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    onTouchTrackMove?.(e);
  };

  const handleTouchEnd = () => {
    ignoreMouseUntilRef.current = Date.now() + 800;
    onTouchTrackEnd?.();
    onStop();
  };

  const handleTouchCancel = () => {
    ignoreMouseUntilRef.current = Date.now() + 800;
    onTouchTrackEnd?.();
    onCancel();
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    if (!isRecording) return;
    // 仅在按住拖出按钮时取消，避免点击态被 hover/transform 抖动误触发。
    if (e.buttons === 1) {
      onCancel();
    }
  };

  return (
    <button
      ref={buttonRef}
      disabled={disabled}
      onMouseDown={handleMouseDown}
      onMouseUp={onStop}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className={cn(
        "relative w-14 h-14 rounded-full flex items-center justify-center",
        "transition-all duration-300 overflow-hidden",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-400",
        isRecording
          ? "bg-red-500 text-white shadow-lg shadow-red-500/40 scale-110"
          : "bg-white text-slate-700 shadow-md hover:shadow-lg hover:scale-105 border border-slate-200"
      )}
    >
      {/* 涟漪效果 */}
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          className="absolute rounded-full bg-white/30 animate-ripple"
          style={{
            left: ripple.x,
            top: ripple.y,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
      
      {/* 录音中动画环 */}
      {isRecording && (
        <>
          <div className={cn(
            "absolute inset-0 rounded-full border-2 animate-ping opacity-40",
            isCanceling ? "border-red-600" : "border-red-400"
          )} />
          <div className={cn(
            "absolute inset-0 rounded-full border-2 animate-pulse",
            isCanceling ? "border-red-600 scale-110" : "border-red-300"
          )} />
        </>
      )}
      
      {/* 图标 */}
      <Mic className={cn(
        "w-6 h-6 transition-transform duration-200",
        isRecording && "animate-pulse",
        isCanceling && "text-red-100"
      )} />
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function VoiceInputDock({ onOpenSettings }: { onOpenSettings: () => void }) {
  const router = useRouter();
  // State
  const [inputValue, setInputValue] = useState('');
  const [isRecordingLocal, setIsRecordingLocal] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isVipModalOpen, setIsVipModalOpen] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [visualEnergy, setVisualEnergy] = useState(0);
  
  // Refs
  const touchStartY = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordStartAtRef = useRef<number>(0);
  const isStoppingRef = useRef(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const lipSyncRafRef = useRef<number | null>(null);
  const lipSyncContextRef = useRef<AudioContext | null>(null);
  const lipSyncAnalyserRef = useRef<AnalyserNode | null>(null);
  const lipSyncSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const vadRecorderRef = useRef<VADRecorder | null>(null);
  const visualEnergyRafRef = useRef<number | null>(null);
  const submitVoiceBlobRef = useRef<((wavBlob: Blob) => Promise<void>) | null>(null);
  const forceStopPressToTalkRef = useRef<(() => void) | null>(null);

  // Store
  const sessionId = useSessionStore((state) => state.sessionId);
  const addMessage = useSessionStore((state) => state.addMessage);
  const autoPlayVoice = useSettingsStore((state) => state.autoPlayVoice);
  const vipModeEnabled = useSettingsStore((state) => state.vipModeEnabled);
  const setAvatarEmotion = useAvatarStore((state) => state.setEmotion);
  
  const {
    stage,
    error: pipelineError,
    inputMode,
    vadStatus,
    lipSyncEnergy,
    setStage,
    setError,
    setLipSyncEnergy,
    setInputMode,
    setVADStatus,
    setAvatarAnimation,
  } = usePipelineStore();

  const applyAssistantState = useCallback((emotion: Emotion, animation: Animation) => {
    setAvatarEmotion(emotion);
    setAvatarAnimation(animation);
  }, [setAvatarAnimation, setAvatarEmotion]);

  // Derived state
  const isPipelineBusy = stage === 'processing' || stage === 'uploading';
  const isVADMode = inputMode === 'vad';
  const isPushToTalkMode = inputMode === 'push-to-talk';
  const isVADActive = isVADMode && vadStatus !== 'idle';
  const vadConfig = VAD_STATUS_CONFIG[vadStatus];

  // ==========================================================================
  // Audio & LipSync
  // ==========================================================================

  const stopLipSyncTracking = useCallback(() => {
    if (lipSyncRafRef.current !== null) {
      window.cancelAnimationFrame(lipSyncRafRef.current);
      lipSyncRafRef.current = null;
    }
    if (lipSyncSourceRef.current) {
      lipSyncSourceRef.current.disconnect();
      lipSyncSourceRef.current = null;
    }
    if (lipSyncAnalyserRef.current) {
      lipSyncAnalyserRef.current.disconnect();
      lipSyncAnalyserRef.current = null;
    }
    const context = lipSyncContextRef.current;
    lipSyncContextRef.current = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => {});
    }
    setLipSyncEnergy(0);
  }, [setLipSyncEnergy]);

  const stopPlaybackAndLipSync = useCallback((pauseAudio = true) => {
    const activeAudio = audioPlayerRef.current;
    if (activeAudio) {
      activeAudio.onended = null;
      activeAudio.onerror = null;
      if (pauseAudio) {
        activeAudio.pause();
      }
      audioPlayerRef.current = null;
    }
    stopLipSyncTracking();
  }, [stopLipSyncTracking]);

  const startLipSyncTracking = useCallback((audio: HTMLAudioElement) => {
    const AudioContextCtor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!AudioContextCtor) {
      setLipSyncEnergy(0);
      return;
    }

    stopLipSyncTracking();

    try {
      const context = new AudioContextCtor();
      const source = context.createMediaElementSource(audio);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyser.connect(context.destination);

      lipSyncContextRef.current = context;
      lipSyncSourceRef.current = source;
      lipSyncAnalyserRef.current = analyser;

      if (context.state === 'suspended') {
        void context.resume();
      }

      const timeDomainData = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (!lipSyncAnalyserRef.current) return;
        lipSyncAnalyserRef.current.getByteTimeDomainData(timeDomainData);
        let sumSquares = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          const normalized = (timeDomainData[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / timeDomainData.length);
        const normalizedEnergy = Math.min(Math.max(rms * 3, 0), 1);
        setLipSyncEnergy(normalizedEnergy);
        lipSyncRafRef.current = window.requestAnimationFrame(tick);
      };
      lipSyncRafRef.current = window.requestAnimationFrame(tick);
    } catch {
      stopLipSyncTracking();
    }
  }, [setLipSyncEnergy, stopLipSyncTracking]);

  const playAssistantAudioBase64 = useCallback(async (audioBase64: string) => {
    setStage('speaking');
    stopPlaybackAndLipSync(true);

    const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
    audioPlayerRef.current = audio;

    audio.onended = () => {
      stopPlaybackAndLipSync(false);
      setStage('idle');
    };
    audio.onerror = () => {
      stopPlaybackAndLipSync(false);
      setStage('idle');
    };

    try {
      await audio.play();
      if (audioPlayerRef.current === audio) {
        startLipSyncTracking(audio);
      }
    } catch {
      stopPlaybackAndLipSync(false);
      setStage('idle');
    }
  }, [setStage, startLipSyncTracking, stopPlaybackAndLipSync]);

  // ==========================================================================
  // VAD Recorder
  // ==========================================================================

  const stopVADRecorder = useCallback(() => {
    if (vadRecorderRef.current?.isRunning()) {
      vadRecorderRef.current.stop();
    }
    setVADStatus('idle');
  }, [setVADStatus]);

  const startVADRecorder = useCallback(async () => {
    if (vadRecorderRef.current?.isRunning()) return;
    if (!vipModeEnabled) {
      setIsVipModalOpen(true);
      setInputMode('text');
      setVADStatus('idle');
      return;
    }

    if (!vadRecorderRef.current) {
      vadRecorderRef.current = new VADRecorder({
        onSpeechStart: () => {
          const store = usePipelineStore.getState();
          if (store.inputMode !== 'vad') return;
          store.setVADStatus('speaking');
          store.setStage('recording');
        },
        onSpeechEnd: async (audioBlob) => {
          const store = usePipelineStore.getState();
          if (store.inputMode !== 'vad') return;
          const submitVoice = submitVoiceBlobRef.current;
          if (!submitVoice) {
            return;
          }
          await submitVoice(audioBlob);
        },
        onVADMisfire: () => {
          const store = usePipelineStore.getState();
          if (store.inputMode !== 'vad') return;
          store.setVADStatus('listening');
          if (store.stage === 'recording') {
            store.setStage('idle');
          }
        },
        onStatusChange: (status) => {
          const store = usePipelineStore.getState();
          if (store.inputMode !== 'vad') return;
          store.setVADStatus(status as VADStatus);
          if (status === 'listening' && store.stage === 'recording') {
            store.setStage('idle');
          }
        },
        onError: (error) => {
          const store = usePipelineStore.getState();
          if (store.inputMode !== 'vad') return;
          store.setError(error.message || 'VAD 录音失败');
          store.setStage('error');
        },
      });
    }

    await vadRecorderRef.current.start();
  }, [vipModeEnabled, setInputMode, setVADStatus]);

  // ==========================================================================
  // Voice Submission
  // ==========================================================================

  const submitVoiceBlob = useCallback(async (wavBlob: Blob) => {
    if (wavBlob.size === 0) {
      throw new Error('录音为空，请重试');
    }

    setStage('uploading');

    const response = await api.chatVoice(sessionId, DEFAULT_PERSONA_ID, wavBlob, {
      tts_provider: REQUIRED_TTS_PROVIDER,
      qwen_voice_id: DEFAULT_QWEN_VOICE_ID,
      qwen_target_model: DEFAULT_QWEN_TARGET_MODEL,
    });

    setStage('processing');

    addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: response.transcript_text || '（语音消息）',
      createdAt: Date.now(),
    });

    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: response.assistant_text,
      createdAt: Date.now(),
      emotion: response.emotion,
    });
    applyAssistantState(response.emotion, response.animation);

    if (response.tts_audio_base64) {
      const normalized = String(response.tts_provider || '').trim().toLowerCase();
      if (normalized !== REQUIRED_TTS_PROVIDER) {
        setError(`TTS 链路未走 Qwen（provider=${response.tts_provider || 'unknown'}）`);
        setStage('error');
        return;
      }
      await playAssistantAudioBase64(response.tts_audio_base64);
      return;
    }

    if (response.tts_error) {
      setError(`语音合成未成功：${response.tts_error}`);
      setStage('error');
      return;
    }

    setStage('idle');
  }, [sessionId, addMessage, applyAssistantState, playAssistantAudioBase64, setError, setStage]);
  submitVoiceBlobRef.current = submitVoiceBlob;

  // ==========================================================================
  // Input Mode Management
  // ==========================================================================

  const handleInputModeChange = useCallback(async (nextMode: InputMode) => {
    if (nextMode === inputMode) return;
    if (nextMode !== 'text' && !vipModeEnabled) {
      setIsVipModalOpen(true);
      return;
    }

    if (isRecordingLocal) {
      forceStopPressToTalkRef.current?.();
    }
    if (nextMode !== 'vad') {
      stopVADRecorder();
    }

    setInputMode(nextMode);
    setError(null);
    if (stage === 'error') {
      setStage('idle');
    }

    if (nextMode === 'vad') {
      try {
        await startVADRecorder();
      } catch (error) {
        setError(extractApiErrorMessage(error, 'VAD 启动失败，请稍后重试'));
        setStage('error');
        setInputMode('push-to-talk');
      }
    }
  }, [inputMode, isRecordingLocal, vipModeEnabled, setError, setInputMode, setStage, stage, startVADRecorder, stopVADRecorder]);

  const forceStopPressToTalk = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    recordStartAtRef.current = 0;
    isStoppingRef.current = false;
    setIsRecordingLocal(false);
    setRecordingDuration(0);
    setIsCanceling(false);
    if (stage === 'recording') {
      setStage('idle');
    }
  }, [setStage, stage]);
  forceStopPressToTalkRef.current = forceStopPressToTalk;

  // ==========================================================================
  // Press-to-Talk Recording
  // ==========================================================================

  const startRecording = useCallback(async () => {
    if (inputMode !== 'push-to-talk') return;
    if (isRecordingLocal) return;
    if (!vipModeEnabled) {
      setIsVipModalOpen(true);
      return;
    }
    
    stopVADRecorder();
    stopPlaybackAndLipSync();
    setIsCanceling(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const preferredMime = mimeCandidates.find((value) => MediaRecorder.isTypeSupported(value));
      const mediaRecorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.start();
      recordStartAtRef.current = Date.now();
      setIsRecordingLocal(true);
      setRecordingDuration(0);
      setStage('recording');

      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 0.1);
      }, 100);
    } catch {
      alert("请允许麦克风权限以使用语音功能");
      setStage('idle');
    }
  }, [inputMode, isRecordingLocal, vipModeEnabled, setStage, stopPlaybackAndLipSync, stopVADRecorder]);

  const stopRecording = useCallback(() => {
    if (!isRecordingLocal || !mediaRecorderRef.current) return;

    const durationSinceStart = Date.now() - recordStartAtRef.current;
    // 轻点时先保持录音，支持“点一次开始，再点一次结束”。
    if (!isCanceling && durationSinceStart < PRESS_TO_TALK_MIN_RELEASE_MS) {
      return;
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (isStoppingRef.current || recorder.state !== 'recording') return;
    isStoppingRef.current = true;
    
    recorder.onstop = async () => {
      try {
        const durationMs = Date.now() - recordStartAtRef.current;
        if (isCanceling || durationMs < 500) {
          setIsRecordingLocal(false);
          setStage('idle');
          mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
          return;
        }

        const sourceBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (sourceBlob.size === 0) {
          throw new Error('录音为空，请重试');
        }

        const wavBlob = await convertAudioBlobToWav16k(sourceBlob);
        if (wavBlob.size === 0) {
          throw new Error('录音转换失败');
        }

        setIsRecordingLocal(false);
        await submitVoiceBlob(wavBlob);
      } catch (err) {
        stopPlaybackAndLipSync();
        setError(extractApiErrorMessage(err, "语音交互失败"));
        setStage('error');
      } finally {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        recordStartAtRef.current = 0;
        isStoppingRef.current = false;
        setIsRecordingLocal(false);
        setIsCanceling(false);
      }
    };

    recorder.requestData();
    recorder.stop();
  }, [isCanceling, isRecordingLocal, setError, setStage, stopPlaybackAndLipSync, submitVoiceBlob]);

  const cancelRecording = useCallback(() => {
    if (!isRecordingLocal || !mediaRecorderRef.current) return;
    const recorder = mediaRecorderRef.current;
    if (recorder.state === 'recording') {
      isStoppingRef.current = true;
      recorder.stop();
    }
    forceStopPressToTalk();
  }, [forceStopPressToTalk, isRecordingLocal]);

  // Touch handlers for swipe-to-cancel
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current !== null && isRecordingLocal) {
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - touchStartY.current;
      setIsCanceling(deltaY < -50);
    }
  };

  const handleTouchEnd = () => {
    touchStartY.current = null;
  };

  // ==========================================================================
  // Text Chat
  // ==========================================================================

  const handleSendText = useCallback(async () => {
    if (!inputValue.trim()) return;
    
    const textToSend = inputValue.trim();
    setInputValue('');
    stopPlaybackAndLipSync();

    addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: textToSend,
      createdAt: Date.now(),
    });

    setStage('processing');

    try {
      const canUseVipVoice = autoPlayVoice && vipModeEnabled;
      const response = canUseVipVoice
        ? await api.chatTextWithVoice({
            session_id: sessionId,
            persona_id: DEFAULT_PERSONA_ID,
            user_text: textToSend,
            tts_provider: REQUIRED_TTS_PROVIDER,
            qwen_voice_id: DEFAULT_QWEN_VOICE_ID,
            qwen_target_model: DEFAULT_QWEN_TARGET_MODEL,
          })
        : await api.chatText({
            session_id: sessionId,
            persona_id: DEFAULT_PERSONA_ID,
            user_text: textToSend
          });

      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.assistant_text,
        createdAt: Date.now(),
        emotion: response.emotion
      });
      applyAssistantState(response.emotion, response.animation);

      if (autoPlayVoice && !vipModeEnabled) {
        setIsVipModalOpen(true);
      }

      if (canUseVipVoice) {
        const voiceResponse = response as ChatTextVoiceResponse;
        if (voiceResponse.tts_audio_base64) {
          const normalized = String(voiceResponse.tts_provider || '').trim().toLowerCase();
          if (normalized !== REQUIRED_TTS_PROVIDER) {
            setError(`TTS 链路未走 Qwen（provider=${voiceResponse.tts_provider || 'unknown'}）`);
            setStage('error');
            return;
          }
          await playAssistantAudioBase64(voiceResponse.tts_audio_base64);
          return;
        }
        if (voiceResponse.tts_error) {
          setError(`语音合成未成功：${voiceResponse.tts_error}`);
          setStage('error');
          return;
        }
      }

      setStage('idle');
    } catch (err) {
      setError(extractApiErrorMessage(err, "发送失败，请重试"));
      setStage('error');
    }
  }, [inputValue, addMessage, applyAssistantState, setStage, setError, sessionId, stopPlaybackAndLipSync, autoPlayVoice, vipModeEnabled, playAssistantAudioBase64]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendText();
    }
  };

  // ==========================================================================
  // Effects
  // ==========================================================================

  useEffect(() => {
    return () => {
      stopPlaybackAndLipSync();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      vadRecorderRef.current?.dispose();
      vadRecorderRef.current = null;
      setVADStatus('idle');
    };
  }, [setVADStatus, stopPlaybackAndLipSync]);

  useEffect(() => {
    if (inputMode !== 'vad') {
      stopVADRecorder();
      return;
    }
    if (!vipModeEnabled || isRecordingLocal) {
      stopVADRecorder();
      return;
    }
    if (stage === 'processing' || stage === 'uploading' || stage === 'speaking' || stage === 'error') {
      stopVADRecorder();
      return;
    }

    void startVADRecorder().catch((error) => {
      setError(extractApiErrorMessage(error, 'VAD 启动失败，请改用按键模式'));
      setStage('error');
      setInputMode('push-to-talk');
    });
  }, [inputMode, isRecordingLocal, setError, setInputMode, setStage, stage, startVADRecorder, stopVADRecorder, vipModeEnabled]);

  useEffect(() => {
    const globalWindow = window as WebkitWindow;
    globalWindow.__testLipSync = (energy = 0) => {
      const safeEnergy = Math.max(0, Math.min(1, Number.isFinite(energy) ? energy : 0));
      setLipSyncEnergy(safeEnergy);
      return safeEnergy;
    };
    return () => {
      delete globalWindow.__testLipSync;
    };
  }, [setLipSyncEnergy]);

  // 视觉能量动画
  useEffect(() => {
    if (!isVADActive && !isRecordingLocal) {
      setVisualEnergy(0);
      return;
    }
    
    const animate = () => {
      const targetEnergy = lipSyncEnergy;
      setVisualEnergy(prev => prev + (targetEnergy - prev) * 0.3);
      visualEnergyRafRef.current = requestAnimationFrame(animate);
    };
    visualEnergyRafRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (visualEnergyRafRef.current) {
        cancelAnimationFrame(visualEnergyRafRef.current);
      }
    };
  }, [isVADActive, isRecordingLocal, lipSyncEnergy]);

  // ==========================================================================
  // Render Helpers
  // ==========================================================================

  const inputPlaceholder = useMemo(() => {
    if (isPushToTalkMode) {
      return isRecordingLocal ? '正在聆听...' : '输入消息或按住麦克风说话...';
    }
    if (isVADMode) {
      return vadStatus === 'speaking' ? '正在聆听你的声音...' : '直接说话，我会自动识别...';
    }
    return '输入消息...';
  }, [isPushToTalkMode, isRecordingLocal, isVADMode, vadStatus]);

  const statusMessage = useMemo(() => {
    if (stage === 'error') return pipelineError || '连接错误';
    if (isVADMode) return vadConfig.label;
    if (isPushToTalkMode && isRecordingLocal) return `录音中 ${recordingDuration.toFixed(1)}s`;
    if (isPipelineBusy) return '处理中...';
    return '准备就绪';
  }, [stage, pipelineError, isVADMode, vadConfig.label, isPushToTalkMode, isRecordingLocal, recordingDuration, isPipelineBusy]);

  const handleActivateVip = useCallback(() => {
    setIsVipModalOpen(false);
    router.push('/sponsor?return_to=/chat');
  }, [router]);

  return (
    <>
      <div 
        className={cn(
          "relative w-full transition-all duration-300",
          "pb-[env(safe-area-inset-bottom)]",
          isPipelineBusy && "opacity-80"
        )}
      >
        {/* Error Banner */}
        {stage === 'error' && (
          <div className="absolute -top-12 left-4 right-4 z-20">
            <div className="flex items-center justify-between rounded-xl bg-red-50/95 backdrop-blur-md p-3 text-sm text-red-600 shadow-lg border border-red-100 animate-slide-up">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                <span className="line-clamp-1">{pipelineError}</span>
              </div>
              <button
                onClick={() => {
                  setError(null);
                  setStage('idle');
                }}
                className="p-1.5 hover:bg-red-100 rounded-full transition-colors"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Main Dock Container */}
        <div className="glass-panel rounded-t-2xl mx-2 mb-2">
          {/* Mode Selector & Status Bar */}
          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            <ModeSelector 
              currentMode={inputMode} 
              onModeChange={handleInputModeChange}
              disabled={isPipelineBusy || isRecordingLocal}
            />
            
            <div className="flex items-center gap-2">
              {/* Status Indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 text-xs font-medium text-slate-600">
                <VADStatusIndicator status={vadStatus} size="sm" />
                <span>{statusMessage}</span>
              </div>
              
              {/* Settings Button */}
              <TouchFeedback
                className="rounded-full"
                disabled={isPipelineBusy}
                options={{ enableHighlight: false }}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-9 h-9 rounded-full text-slate-400 hover:text-slate-600 hover:bg-white/80"
                  onClick={onOpenSettings}
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </TouchFeedback>
            </div>
          </div>

          {/* Waveform Visualization Area */}
          {(isVADActive || isRecordingLocal) && (
            <div className="px-4 py-2">
              <div className={cn(
                "rounded-xl overflow-hidden transition-all duration-300",
                isVADMode ? "bg-sky-50/80" : "bg-amber-50/80"
              )}>
                <WaveformVisualizer 
                  energy={visualEnergy}
                  isActive={isVADActive || isRecordingLocal}
                  mode={isVADMode ? 'vad' : 'recording'}
                />
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="p-4 flex items-center gap-3">
            {/* Text Input */}
            <div className="relative flex-1">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={inputPlaceholder}
                disabled={isRecordingLocal || isPipelineBusy}
                className={cn(
                  "h-12 pl-5 pr-12 rounded-full text-sm transition-all duration-300",
                  "bg-white/80 border-0 shadow-sm",
                  "focus:ring-2 focus:ring-primary-400 focus:bg-white",
                  "placeholder:text-slate-400",
                  isRecordingLocal && "opacity-50"
                )}
              />
              {/* Input Status Icon */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {isVADMode ? (
                  <VADStatusIndicator status={vadStatus} size="sm" />
                ) : isRecordingLocal ? (
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                ) : null}
              </div>
            </div>

            {/* Action Button */}
            {inputValue.trim() ? (
              <TouchFeedback
                className="rounded-full shrink-0"
                disabled={isPipelineBusy}
                options={{ enableHighlight: false }}
              >
                <Button
                  onClick={handleSendText}
                  disabled={isPipelineBusy}
                  className={cn(
                    "w-12 h-12 rounded-full p-0 shrink-0",
                    "bg-gradient-to-r from-primary-400 to-primary-600",
                    "text-white shadow-lg shadow-primary-500/30",
                    "hover:scale-105 hover:shadow-xl hover:shadow-primary-500/40",
                    "active:scale-95 transition-all duration-200"
                  )}
                >
                  <Send className="w-5 h-5 ml-0.5" strokeWidth={2.5} />
                </Button>
              </TouchFeedback>
            ) : isPushToTalkMode ? (
              <RecordButton
                isRecording={isRecordingLocal}
                isCanceling={isCanceling}
                onStart={startRecording}
                onStop={stopRecording}
                onCancel={cancelRecording}
                onTouchTrackStart={handleTouchStart}
                onTouchTrackMove={handleTouchMove}
                onTouchTrackEnd={handleTouchEnd}
                disabled={isPipelineBusy}
              />
            ) : (
              <TouchFeedback
                className="rounded-full shrink-0"
                disabled={isPipelineBusy}
                options={{ enableHighlight: false }}
              >
                <button
                  onClick={() => {
                    if (isVADMode) {
                      if (isVADActive) {
                        stopVADRecorder();
                        setInputMode('push-to-talk');
                      } else {
                        void handleInputModeChange('vad');
                      }
                    } else {
                      setInputMode('push-to-talk');
                    }
                  }}
                  disabled={isPipelineBusy}
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    "transition-all duration-300",
                    isVADActive
                      ? "bg-sky-500 text-white shadow-lg shadow-sky-500/40"
                      : "bg-white text-slate-600 shadow-md hover:shadow-lg border border-slate-200"
                  )}
                >
                  <Mic className={cn("w-5 h-5", isVADActive && "animate-pulse")} />
                </button>
              </TouchFeedback>
            )}
          </div>

          {/* Cancel Hint for Push-to-Talk */}
          {isPushToTalkMode && isRecordingLocal && (
            <div className="px-4 pb-4 text-center">
              <span className={cn(
                "text-xs font-medium transition-colors duration-200",
                isCanceling ? "text-red-500" : "text-slate-400"
              )}>
                {isCanceling ? '松开手指取消发送' : '上滑取消'}
              </span>
            </div>
          )}

          {/* VAD Hints */}
          {isVADMode && vadStatus === 'idle' && !isPipelineBusy && (
            <div className="px-4 pb-4 text-center">
              <span className="text-xs text-slate-400">
                直接说话即可，无需按住按钮
              </span>
            </div>
          )}
        </div>
      </div>

      <VipModal
        isOpen={isVipModalOpen}
        onClose={() => setIsVipModalOpen(false)}
        onActivate={handleActivateVip}
      />

      <TouchFeedbackStyles />

      {/* CSS for ripple animation */}
      <style jsx>{`
        @keyframes ripple {
          from {
            width: 0;
            height: 0;
            opacity: 0.5;
          }
          to {
            width: 200px;
            height: 200px;
            opacity: 0;
          }
        }
        .animate-ripple {
          animation: ripple 0.6s ease-out forwards;
        }
      `}</style>
    </>
  );
}
