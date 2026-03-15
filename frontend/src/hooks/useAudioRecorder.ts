import { useState, useRef, useCallback } from 'react';

interface AudioChunkPayload {
  base64: string;
  mimeType: string;
}

interface StartRecordingOptions {
  onChunk?: (chunk: AudioChunkPayload) => void | Promise<void>;
}

interface UseAudioRecorderReturn {
  isRecording: boolean;
  startRecording: (options?: StartRecordingOptions) => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  error: string | null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function floatTo16BitPCM(float32Samples: Float32Array): Int16Array {
  const int16 = new Int16Array(float32Samples.length);
  for (let i = 0; i < float32Samples.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

function downsampleBuffer(input: Float32Array, inputSampleRate: number, targetSampleRate: number): Float32Array {
  if (targetSampleRate >= inputSampleRate) return input;

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i++) {
      accum += input[i];
      count++;
    }

    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.length * 2);
  for (let i = 0; i < int16.length; i++) {
    bytes[i * 2] = int16[i] & 0xff;
    bytes[i * 2 + 1] = (int16[i] >> 8) & 0xff;
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onChunkRef = useRef<StartRecordingOptions['onChunk']>(undefined);

  const startRecording = useCallback(async (options?: StartRecordingOptions) => {
    try {
      setError(null);
      onChunkRef.current = options?.onChunk;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      if (onChunkRef.current) {
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        sourceNodeRef.current = source;

        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorNodeRef.current = processor;

        processor.onaudioprocess = async (event) => {
          if (!onChunkRef.current) return;

          const input = event.inputBuffer.getChannelData(0);
          const downsampled = downsampleBuffer(input, audioContext.sampleRate, 16000);
          const pcm16 = floatTo16BitPCM(downsampled);

          if (pcm16.length === 0) return;

          try {
            await onChunkRef.current({
              base64: int16ToBase64(pcm16),
              mimeType: 'audio/pcm;rate=16000',
            });
          } catch {
            // swallow per-chunk errors so recording continues
          }
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
      }

      mediaRecorder.start(250); // collect chunks every 250ms
      setIsRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  }, []);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

        if (processorNodeRef.current) {
          processorNodeRef.current.disconnect();
          processorNodeRef.current.onaudioprocess = null;
          processorNodeRef.current = null;
        }
        if (sourceNodeRef.current) {
          sourceNodeRef.current.disconnect();
          sourceNodeRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => undefined);
          audioContextRef.current = null;
        }

        // Stop all tracks to release mic
        recorder.stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        onChunkRef.current = undefined;
        setIsRecording(false);
        resolve(blob);
      };

      recorder.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording, error };
}
