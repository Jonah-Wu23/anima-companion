import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Send, Mic, Settings, XCircle } from 'lucide-react';
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

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
  __testLipSync?: (energy?: number) => number;
};
const DEFAULT_PERSONA_ID = process.env.NEXT_PUBLIC_DEFAULT_PERSONA_ID || 'phainon';
const REQUIRED_TTS_PROVIDER = 'qwen_clone_tts';
const DEFAULT_QWEN_VOICE_ID = (process.env.NEXT_PUBLIC_QWEN_VOICE_ID || '').trim();
const DEFAULT_QWEN_TARGET_MODEL = (process.env.NEXT_PUBLIC_QWEN_TARGET_MODEL || '').trim();
const VOICE_MODE_LABELS: Record<InputMode, string> = {
  text: '文本',
  'push-to-talk': '按键',
  vad: 'VAD',
};

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

export function InputDock({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [inputValue, setInputValue] = useState('');
  const [isRecordingLocal, setIsRecordingLocal] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isVipModalOpen, setIsVipModalOpen] = useState(false);
  
  const sessionId = useSessionStore((state) => state.sessionId);
  const addMessage = useSessionStore((state) => state.addMessage);
  const autoPlayVoice = useSettingsStore((state) => state.autoPlayVoice);
  const vipModeEnabled = useSettingsStore((state) => state.vipModeEnabled);
  const enableVipMode = useSettingsStore((state) => state.enableVipMode);
  const setAvatarEmotion = useAvatarStore((state) => state.setEmotion);
  
  const {
    stage,
    error: pipelineError,
    inputMode,
    vadStatus,
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
      void context.close().catch((closeError: unknown) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[InputDock] close audio context failed:', closeError);
        }
      });
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
        if (!lipSyncAnalyserRef.current) {
          return;
        }

        lipSyncAnalyserRef.current.getByteTimeDomainData(timeDomainData);

        let sumSquares = 0;
        for (let index = 0; index < timeDomainData.length; index += 1) {
          const normalized = (timeDomainData[index] - 128) / 128;
          sumSquares += normalized * normalized;
        }

        const rms = Math.sqrt(sumSquares / timeDomainData.length);
        const normalizedEnergy = Math.min(Math.max(rms * 3, 0), 1);
        setLipSyncEnergy(normalizedEnergy);

        lipSyncRafRef.current = window.requestAnimationFrame(tick);
      };

      lipSyncRafRef.current = window.requestAnimationFrame(tick);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[InputDock] init lip sync analyser failed:', error);
      }
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
      console.error("Audio playback error");
      stopPlaybackAndLipSync(false);
      setStage('idle');
    };

    try {
      await audio.play();
      if (audioPlayerRef.current === audio) {
        startLipSyncTracking(audio);
      }
    } catch (error) {
      console.error("Auto-play blocked:", error);
      stopPlaybackAndLipSync(false);
      setStage('idle');
    }
  }, [setStage, startLipSyncTracking, stopPlaybackAndLipSync]);

  useEffect(() => () => {
    stopPlaybackAndLipSync();
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    vadRecorderRef.current?.dispose();
    vadRecorderRef.current = null;
    setVADStatus('idle');
  }, [setVADStatus, stopPlaybackAndLipSync]);

  const touchStartY = useRef<number | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);

  const requireVipOrPrompt = useCallback((): boolean => {
    if (vipModeEnabled) {
      return true;
    }
    setIsVipModalOpen(true);
    return false;
  }, [vipModeEnabled]);

  const ensureQwenProvider = useCallback((provider: string | null | undefined): boolean => {
    const normalized = String(provider || '').trim().toLowerCase();
    if (normalized === REQUIRED_TTS_PROVIDER) {
      return true;
    }
    setError(`TTS 链路未走 Qwen（provider=${provider || 'unknown'}）`);
    setStage('error');
    return false;
  }, [setError, setStage]);

  const handleActivateVip = useCallback(() => {
    enableVipMode();
    setIsVipModalOpen(false);
  }, [enableVipMode]);

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

  const submitVoiceBlob = useCallback(
    async (wavBlob: Blob) => {
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
        if (!ensureQwenProvider(response.tts_provider)) {
          return;
        }
        await playAssistantAudioBase64(response.tts_audio_base64);
        return;
      }

      if (response.tts_error) {
        setError(
          `语音合成未成功：${response.tts_error}` +
            (response.tts_provider ? ` (provider=${response.tts_provider})` : '')
        );
        setStage('error');
        return;
      }

      setStage('idle');
    },
    [
      addMessage,
      applyAssistantState,
      ensureQwenProvider,
      playAssistantAudioBase64,
      sessionId,
      setError,
      setStage,
    ]
  );

  const stopVADRecorder = useCallback(() => {
    if (vadRecorderRef.current?.isRunning()) {
      vadRecorderRef.current.stop();
    }
    setVADStatus('idle');
  }, [setVADStatus]);

  const startVADRecorder = useCallback(async () => {
    if (vadRecorderRef.current?.isRunning()) {
      return;
    }

    if (!requireVipOrPrompt()) {
      setInputMode('text');
      setVADStatus('idle');
      return;
    }

    if (!vadRecorderRef.current) {
      vadRecorderRef.current = new VADRecorder({
        onSpeechStart: () => {
          usePipelineStore.getState().setVADStatus('speaking');
          usePipelineStore.getState().setStage('recording');
        },
        onSpeechEnd: async (audioBlob) => {
          await submitVoiceBlob(audioBlob);
        },
        onVADMisfire: () => {
          const store = usePipelineStore.getState();
          store.setVADStatus('listening');
          if (store.stage === 'recording') {
            store.setStage('idle');
          }
        },
        onStatusChange: (status) => {
          const store = usePipelineStore.getState();
          store.setVADStatus(status as VADStatus);
          if (status === 'listening' && store.stage === 'recording') {
            store.setStage('idle');
          }
        },
        onError: (error) => {
          usePipelineStore.getState().setError(error.message || 'VAD 录音失败');
          usePipelineStore.getState().setStage('error');
        },
      });
    }

    await vadRecorderRef.current.start();
  }, [requireVipOrPrompt, setInputMode, setVADStatus, submitVoiceBlob]);

  const handleInputModeChange = useCallback(
    async (nextMode: InputMode) => {
      if (nextMode === inputMode) {
        return;
      }

      if (nextMode !== 'text' && !requireVipOrPrompt()) {
        return;
      }

      if (isRecordingLocal) {
        forceStopPressToTalk();
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
    },
    [
      forceStopPressToTalk,
      inputMode,
      isRecordingLocal,
      requireVipOrPrompt,
      setError,
      setInputMode,
      setStage,
      startVADRecorder,
      stage,
      stopVADRecorder,
    ]
  );

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
  }, [
    inputMode,
    isRecordingLocal,
    setError,
    setInputMode,
    setStage,
    stage,
    startVADRecorder,
    stopVADRecorder,
    vipModeEnabled,
  ]);

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

  // Handlers
  const handleSendText = useCallback(async () => {
    if (!inputValue.trim()) return;
    
    const textToSend = inputValue.trim();
    setInputValue('');
    stopPlaybackAndLipSync();

    // Add user message immediately (Optimistic)
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
          if (!ensureQwenProvider(voiceResponse.tts_provider)) {
            return;
          }
          await playAssistantAudioBase64(voiceResponse.tts_audio_base64);
          return;
        }
        if (voiceResponse.tts_error) {
          setError(
            `语音合成未成功：${voiceResponse.tts_error}` +
              (voiceResponse.tts_provider ? ` (provider=${voiceResponse.tts_provider})` : '')
          );
          setStage('error');
          return;
        }
      }

      setStage('idle');
    } catch (err) {
      console.error("Chat Text Error:", err);
      setError(extractApiErrorMessage(err, "发送失败，请重试"));
      setStage('error');
    }
  }, [inputValue, addMessage, applyAssistantState, setStage, setError, sessionId, stopPlaybackAndLipSync, autoPlayVoice, vipModeEnabled, playAssistantAudioBase64, ensureQwenProvider]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  // Recording Logic (Press to Talk)
  const startRecording = useCallback(async () => {
    if (inputMode !== 'push-to-talk') return;
    if (isRecordingLocal) return;
    if (!requireVipOrPrompt()) return;
    stopVADRecorder();
    stopPlaybackAndLipSync();
    setIsCanceling(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4'
      ];
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

      // Start timer
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 0.1);
      }, 100);

    } catch (err) {
      console.error("Mic permission denied", err);
      alert("请允许麦克风权限以使用语音功能");
      setStage('idle');
    }
  }, [inputMode, isRecordingLocal, requireVipOrPrompt, setStage, stopPlaybackAndLipSync, stopVADRecorder]);

  const stopRecording = useCallback(() => {
    if (!isRecordingLocal || !mediaRecorderRef.current) return;
    
    // Clear timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (isStoppingRef.current || recorder.state !== 'recording') return;
    isStoppingRef.current = true;
    
    recorder.onstop = async () => {
      try {
        // Check if canceled or too short
        const durationMs = Date.now() - recordStartAtRef.current;
        if (isCanceling || durationMs < 500) {
          setIsRecordingLocal(false);
          setStage('idle');
          // Cleanup
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
        console.error("Voice Chat Error:", err);
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
    e.preventDefault(); // Prevent scroll/selection
    touchStartY.current = e.touches[0].clientY;
    startRecording();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current !== null && isRecordingLocal) {
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - touchStartY.current;
      
      // If swiped up by more than 50px
      if (deltaY < -50) {
        setIsCanceling(true);
      } else {
        setIsCanceling(false);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (isCanceling) {
      cancelRecording();
    } else {
      stopRecording();
    }
    touchStartY.current = null;
    setIsCanceling(false);
  };

  const isPipelineBusy = stage === 'processing' || stage === 'uploading';
  const isVADMode = inputMode === 'vad';
  const isPushToTalkMode = inputMode === 'push-to-talk';
  const isVADActive = isVADMode && vadStatus !== 'idle';
  const inputPlaceholder = isPushToTalkMode
    ? (isRecordingLocal ? '正在聆听...' : '输入消息或按住说话...')
    : isVADMode
      ? (vadStatus === 'speaking' ? '正在聆听你的声音...' : '直接说话，我会自动识别...')
      : '输入消息...';
  const modeHint = isVADMode
    ? (vadStatus === 'speaking' ? 'VAD 正在收音' : vadStatus === 'processing' ? 'VAD 正在处理' : 'VAD 待机中')
    : isPushToTalkMode
      ? '按住麦克风开始录音'
      : '文本模式';

  return (
    <>
      <div className={cn(
        "relative w-full",
        "pb-[env(safe-area-inset-bottom)] transition-all duration-300",
        (stage === 'processing' || stage === 'uploading') && "opacity-80 pointer-events-none grayscale-[0.2]"
      )}>
        {/* Pipeline Error Display */}
        {stage === 'error' && (
          <div className="absolute -top-10 left-4 right-4 animate-slide-up">
             <div className="flex items-center justify-between rounded-lg bg-red-50/90 backdrop-blur-md p-2 text-xs text-red-600 shadow-sm border border-red-100">
              <span>{pipelineError || '连接错误，请重试。'}</span>
              <button
                onClick={() => {
                  setError(null);
                  setStage('idle');
                }}
                className="p-1 hover:bg-red-100 rounded-full"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full bg-white/60 p-1 border border-white/40">
            {(['text', 'push-to-talk', 'vad'] as InputMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  inputMode === mode
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/80'
                )}
                onClick={() => {
                  void handleInputModeChange(mode);
                }}
              >
                {VOICE_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-slate-500">{modeHint}</div>
        </div>

        {/* Main Dock Content */}
        <div className="flex items-center gap-3 p-4">
        {/* Settings Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="shrink-0 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100/50 rounded-full w-10 h-10"
          onClick={onOpenSettings}
        >
          <Settings className="w-5 h-5" />
        </Button>

        {/* Input Field */}
        <div className="relative flex-1 group">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={inputPlaceholder}
            className={cn(
              "h-12 px-6 py-3 rounded-full text-sm transition-all duration-300",
              "bg-white/50 border-transparent hover:bg-white/80",
              "focus:ring-2 focus:ring-primary-400 focus:bg-white",
              "placeholder:text-neutral-400",
              isRecordingLocal && "opacity-50 pointer-events-none"
            )}
            disabled={isRecordingLocal || isPipelineBusy}
          />
        </div>

        {/* Action Buttons Container */}
        <div className="relative flex items-center justify-center w-12 h-12 shrink-0">
          {inputValue.trim() ? (
            /* Send Button */
            <Button 
              onClick={handleSendText}
              className={cn(
                "absolute inset-0 w-12 h-12 rounded-full p-0",
                "bg-gradient-to-r from-primary-400 to-primary-600",
                "text-white shadow-lg shadow-primary-500/30",
                "hover:scale-105 hover:shadow-xl hover:shadow-primary-500/40",
                "active:scale-95 transition-all duration-300",
                "animate-fade-in"
              )}
              disabled={isPipelineBusy}
            >
              <Send className="w-5 h-5 ml-0.5" strokeWidth={2.5} />
            </Button>
          ) : isPushToTalkMode ? (
            /* Press-to-talk Button */
            <Button
              variant="ghost"
              className={cn(
                "absolute inset-0 w-12 h-12 rounded-full p-0 transition-all duration-300",
                isRecordingLocal
                  ? "bg-red-50 text-red-500 ring-4 ring-red-100 scale-110 z-10"
                  : "bg-transparent text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100/50"
              )}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={cancelRecording}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              disabled={isPipelineBusy}
            >
              {isRecordingLocal ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <div className={cn(
                    "absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-20",
                    isCanceling && "border-red-600 opacity-40 scale-125 duration-75"
                  )}></div>
                  <Mic className={cn(
                    "w-6 h-6 animate-pulse",
                    isCanceling && "text-red-600 scale-110"
                  )} />
                </div>
              ) : (
                <Mic className="w-6 h-6" />
              )}
            </Button>
          ) : (
            /* VAD/Text status button */
            <Button
              variant="ghost"
              className={cn(
                "absolute inset-0 w-12 h-12 rounded-full p-0 transition-all duration-300",
                isVADActive
                  ? "bg-sky-50 text-sky-600 ring-4 ring-sky-100"
                  : "bg-transparent text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100/50"
              )}
              onClick={() => {
                if (isVADMode) {
                  if (isVADActive) {
                    stopVADRecorder();
                    setInputMode('push-to-talk');
                    return;
                  }
                  void handleInputModeChange('vad');
                  return;
                }
                void handleInputModeChange('push-to-talk');
              }}
              disabled={isPipelineBusy}
            >
              <Mic className={cn("w-6 h-6", isVADMode && isVADActive && "animate-pulse")} />
            </Button>
          )}
        </div>
        </div>
      
        {/* Recording Overlay/Hints */}
        {isPushToTalkMode && isRecordingLocal && (
          <div className="absolute bottom-full left-0 right-0 pb-4 flex flex-col items-center justify-end pointer-events-none animate-slide-up">
             {/* Timer Bubble */}
             <div className={cn(
               "bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg mb-2 flex items-center gap-2 transition-all",
               isCanceling && "bg-red-600 scale-110"
             )}>
               <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
               {recordingDuration.toFixed(1)}s
             </div>
             
             {/* Cancel Hint */}
             <div className={cn(
               "text-xs font-medium tracking-wide transition-colors",
               isCanceling ? "text-red-500 font-bold" : "text-neutral-400"
             )}>
               {isCanceling ? "松开取消" : "上滑取消"}
             </div>
          </div>
        )}
      </div>

      <VipModal
        isOpen={isVipModalOpen}
        onClose={() => setIsVipModalOpen(false)}
        onActivate={handleActivateVip}
      />
    </>
  );
}
