import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { Send, Mic, Settings, XCircle } from 'lucide-react';
import { useSessionStore } from '@/lib/store/sessionStore';
import { usePipelineStore } from '@/lib/store/pipelineStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';

type WebkitWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
const DEFAULT_PERSONA_ID = process.env.NEXT_PUBLIC_DEFAULT_PERSONA_ID || 'phainon';

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
  
  const sessionId = useSessionStore((state) => state.sessionId);
  const addMessage = useSessionStore((state) => state.addMessage);
  
  const { stage, error: pipelineError, setStage, setError } = usePipelineStore();
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordStartAtRef = useRef<number>(0);
  const isStoppingRef = useRef(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Handlers
  const handleSendText = useCallback(async () => {
    if (!inputValue.trim()) return;
    
    const textToSend = inputValue.trim();
    setInputValue('');

    // Add user message immediately (Optimistic)
    addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: textToSend,
      createdAt: Date.now(),
    });

    setStage('processing');

    try {
      const response = await api.chatText({
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
      
      setStage('idle');
    } catch (err) {
      console.error("Chat Text Error:", err);
      setError(extractApiErrorMessage(err, "发送失败，请重试"));
      setStage('error');
    }
  }, [inputValue, addMessage, setStage, setError, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  // Recording Logic (Press to Talk)
  const startRecording = useCallback(async () => {
    if (isRecordingLocal) return;

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
      setStage('recording');
    } catch (err) {
      console.error("Mic permission denied", err);
      alert("请允许麦克风权限以使用语音功能");
      setStage('idle');
    }
  }, [isRecordingLocal, setStage]);

  const stopRecording = useCallback(() => {
    if (!isRecordingLocal || !mediaRecorderRef.current) return;
    
    const recorder = mediaRecorderRef.current;
    if (isStoppingRef.current || recorder.state !== 'recording') return;
    isStoppingRef.current = true;
    
    recorder.onstop = async () => {
      try {
        const durationMs = Date.now() - recordStartAtRef.current;
        if (durationMs < 250) {
          throw new Error('按住时间太短，请至少按住 0.3 秒');
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
        setStage('uploading');

        const response = await api.chatVoice(sessionId, DEFAULT_PERSONA_ID, wavBlob);
        
        setStage('processing');
        
        // Add User Transcript
        addMessage({
          id: crypto.randomUUID(),
          role: 'user',
          content: response.transcript_text || "（语音消息）",
          createdAt: Date.now(),
        });
        
        // Add Assistant Response
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.assistant_text,
          createdAt: Date.now(),
          emotion: response.emotion
        });
        
        // Handle TTS
        if (response.tts_audio_base64) {
          setStage('speaking');
          if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
          }
          
          const audio = new Audio(`data:audio/wav;base64,${response.tts_audio_base64}`);
          audioPlayerRef.current = audio;
          
          audio.onended = () => setStage('idle');
          audio.onerror = () => {
             console.error("Audio playback error");
             setStage('idle');
          };
          
          await audio.play().catch(e => {
            console.error("Auto-play blocked:", e);
            setStage('idle');
          });
        } else {
          if (response.tts_error) {
            setError(`语音合成未成功：${response.tts_error}`);
            setStage('error');
            return;
          }
          setStage('idle');
        }
        
      } catch (err) {
        console.error("Voice Chat Error:", err);
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
      }
    };

    recorder.requestData();
    recorder.stop();
  }, [isRecordingLocal, sessionId, setStage, setError, addMessage]);

  return (
    <div className="w-full bg-white border-t border-gray-100 p-3 pb-safe-area-bottom">
      {/* Pipeline Error Display */}
      {stage === 'error' && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-red-50 p-2 text-xs text-red-600">
          <span>{pipelineError || '连接错误，请重试。'}</span>
          <button
            onClick={() => {
              setError(null);
              setStage('idle');
            }}
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Settings / Menu Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="shrink-0 text-gray-400 hover:text-gray-600"
          onClick={onOpenSettings}
        >
          <Settings className="w-5 h-5" />
        </Button>

        {/* Input Area */}
        <div className="relative flex-1">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRecordingLocal ? "正在录音..." : "输入消息..."}
            className={cn(
              "pr-10 transition-all duration-200",
              isRecordingLocal && "bg-red-50 border-red-200 placeholder:text-red-500"
            )}
            disabled={isRecordingLocal || stage === 'processing' || stage === 'uploading'}
          />
        </div>

        {/* Mic / Send Action Button */}
        {inputValue.trim() ? (
          <Button 
            onClick={handleSendText}
            variant="primary" 
            size="icon"
            className="shrink-0 rounded-full"
            disabled={stage === 'processing' || stage === 'uploading'}
          >
            <Send className="w-5 h-5" />
          </Button>
        ) : (
          <Button
            variant={isRecordingLocal ? "danger" : "secondary"}
            size="icon"
            className={cn(
              "shrink-0 rounded-full transition-all duration-200",
              isRecordingLocal && "scale-110 shadow-md ring-4 ring-red-100"
            )}
            // Mouse Events
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            // Touch Events (Mobile)
            onTouchStart={(e) => {
              e.preventDefault(); // Prevent scroll/click
              startRecording();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stopRecording();
            }}
          >
            <Mic className={cn("w-5 h-5", isRecordingLocal && "animate-pulse")} />
          </Button>
        )}
      </div>
      
      {/* Recording Hint */}
      <div className="mt-1 h-4 text-center">
        {isRecordingLocal && (
          <span className="text-[10px] text-red-500 font-medium animate-pulse">
            松开结束 • 上滑取消
          </span>
        )}
      </div>
    </div>
  );
}
