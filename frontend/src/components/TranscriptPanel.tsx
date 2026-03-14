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

export default function TranscriptPanel({ lines, status }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#FFFFFF' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ borderBottom: '1px solid #E8ECF4' }}>
        <div className="flex items-center gap-2.5">
          {status === 'recording' ? (
            <span className="w-2 h-2 rounded-full bg-red-500 recording-ring shrink-0" />
          ) : (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#CBD5E1' }} />
          )}
          <h2 className="text-sm font-semibold" style={{ color: '#0D1B2A' }}>Live Transcript</h2>
        </div>
        <div className="flex items-center gap-4 text-xs" style={{ color: '#94A3B8' }}>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: '#1a56db' }} />
            Doctor
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: '#94A3B8' }} />
            Patient
          </span>
          {lines.length > 0 && (
            <span className="font-semibold" style={{ color: '#64748B' }}>{lines.length} turns</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

        {/* Empty state */}
        {lines.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-5 py-20 text-center">
            {status === 'idle' ? (
              <>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#F0F2F7', border: '1px solid #E2E6EF' }}>
                  <Stethoscope className="w-7 h-7" style={{ color: '#CBD5E1' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#64748B' }}>No transcript yet</p>
                  <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Start or demo a consultation to begin</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                  <span className="w-5 h-5 rounded-full bg-red-500 recording-ring" />
                </div>
                <p className="text-sm font-medium" style={{ color: '#94A3B8' }}>Listening for speech…</p>
              </>
            )}
          </div>
        )}

        {/* Transcript lines */}
        {lines.map((line) => {
          const isDoctor = line.speaker === 'Doctor';
          return (
            <div key={line.id} className={`flex gap-3 transcript-enter ${isDoctor ? '' : 'flex-row-reverse'}`}>
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center mt-0.5"
                style={{
                  background: isDoctor ? '#1a56db' : '#F1F5F9',
                  border: isDoctor ? 'none' : '1px solid #E2E8F0',
                }}
              >
                {isDoctor
                  ? <Stethoscope className="w-3.5 h-3.5 text-white" />
                  : <User className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                }
              </div>

              {/* Bubble */}
              <div className={`max-w-[80%] flex flex-col gap-1 ${isDoctor ? 'items-start' : 'items-end'}`}>
                <div className="flex items-center gap-2 px-0.5">
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: isDoctor ? '#1a56db' : '#64748B' }}
                  >
                    {line.speaker}
                  </span>
                  <span className="text-[10px]" style={{ color: '#CBD5E1' }}>
                    {formatTime(line.timestamp)}
                  </span>
                </div>
                <div
                  className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                  style={
                    isDoctor
                      ? {
                          background: '#EEF4FF',
                          color: '#1E293B',
                          borderTopLeftRadius: '4px',
                          borderLeft: '3px solid #1a56db',
                        }
                      : {
                          background: '#F8FAFC',
                          color: '#374151',
                          borderTopRightRadius: '4px',
                          border: '1px solid #E2E8F0',
                        }
                  }
                >
                  {line.text}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
