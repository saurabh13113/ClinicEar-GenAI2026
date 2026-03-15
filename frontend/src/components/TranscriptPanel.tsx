import { useEffect, useRef } from 'react';
import { Stethoscope, User } from 'lucide-react';
import type { TranscriptLine, SessionStatus } from '../types';

interface TranscriptPanelProps {
  lines: TranscriptLine[];
  status: SessionStatus;
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function AudioWaveform({ paused = false, color = '#3B82F6', height = 32 }: { paused?: boolean; color?: string; height?: number }) {
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {Array.from({ length: 16 }, (_, i) => (
        <div
          key={i}
          className="wave-bar"
          style={{
            height,
            background: color,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
      ))}
    </div>
  );
}

export default function TranscriptPanel({ lines, status }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isRecording = status === 'recording';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#07101E' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 shrink-0"
        style={{
          background: '#0A1628',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          height: '44px',
        }}
      >
        <div className="flex items-center gap-2.5">
          {isRecording ? (
            <span className="w-2 h-2 rounded-full bg-red-500 recording-ring shrink-0" />
          ) : (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#1E3A5A' }} />
          )}
          <h2 className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>Live Transcript</h2>

          {/* Mini waveform in header during recording */}
          {isRecording && (
            <div className="ml-1">
              <AudioWaveform height={14} color="rgba(59,130,246,0.7)" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs" style={{ color: '#3D5878' }}>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: '#1D4ED8' }} />
            Doctor
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: '#2E4A66' }} />
            Patient
          </span>
          {lines.length > 0 && (
            <span className="font-semibold" style={{ color: '#2E4A66' }}>{lines.length} turns</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className={`flex-1 ${lines.length === 0 ? 'overflow-y-hidden' : 'overflow-y-auto'} px-5 py-5 space-y-4`}>

        {/* Empty state */}
        {lines.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center">
            {status === 'idle' ? (
              <>
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <Stethoscope className="w-7 h-7" style={{ color: '#2E4A66' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#3D5878' }}>No transcript yet</p>
                  <p className="text-xs mt-1" style={{ color: '#243650' }}>Start or demo a consultation to begin</p>
                </div>
              </>
            ) : (
              <>
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}
                >
                  <span className="w-5 h-5 rounded-full bg-red-500 recording-ring" />
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-medium" style={{ color: '#5A7FA8' }}>Listening for speech…</p>
                  <div className="flex justify-center">
                    <AudioWaveform height={32} color="#3B82F6" />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Transcript lines */}
        {lines.map((line) => {
          const isDoctor = line.speaker === 'Doctor' || line.speaker === 'Speaker 1';
          return (
            <div key={line.id} className={`flex gap-3 transcript-enter ${isDoctor ? '' : 'flex-row-reverse'}`}>
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center mt-0.5"
                style={
                  isDoctor
                    ? { background: '#1D4ED8', boxShadow: '0 0 0 1px rgba(29,78,216,0.35)' }
                    : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }
                }
              >
                {isDoctor
                  ? <Stethoscope className="w-3.5 h-3.5 text-white" />
                  : <User className="w-3.5 h-3.5" style={{ color: '#5A7FA8' }} />
                }
              </div>

              {/* Bubble */}
              <div className={`max-w-[80%] flex flex-col gap-1 ${isDoctor ? 'items-start' : 'items-end'}`}>
                <div className="flex items-center gap-2 px-0.5">
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: isDoctor ? '#3B82F6' : '#5A7FA8' }}
                  >
                    {line.speaker}
                  </span>
                  <span className="text-[10px]" style={{ color: '#1E3A5A' }}>
                    {formatTime(line.timestamp)}
                  </span>
                </div>
                <div
                  className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                  style={
                    isDoctor
                      ? {
                          background: 'rgba(29, 78, 216, 0.1)',
                          color: '#B8D0F0',
                          borderTopLeftRadius: '4px',
                          borderLeft: '2px solid rgba(59, 130, 246, 0.4)',
                        }
                      : {
                          background: 'rgba(255, 255, 255, 0.04)',
                          color: '#8BA8C8',
                          borderTopRightRadius: '4px',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }
                  }
                >
                  {line.text}
                </div>
              </div>
            </div>
          );
        })}

        {/* Live waveform below last line while recording */}
        {isRecording && lines.length > 0 && (
          <div className="flex justify-center pt-1 pb-1">
            <AudioWaveform height={24} color="rgba(59,130,246,0.45)" />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
