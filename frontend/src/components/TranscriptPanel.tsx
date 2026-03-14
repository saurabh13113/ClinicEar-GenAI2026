import { useEffect, useRef } from 'react';
import { User, Stethoscope } from 'lucide-react';
import type { TranscriptLine, SessionStatus } from '../types';

interface TranscriptPanelProps {
  lines: TranscriptLine[];
  status: SessionStatus;
}

const speakerStyles = {
  Doctor:  { icon: Stethoscope, bg: 'bg-brand-50',  label: 'text-brand-700',  bubble: 'bg-brand-50 border-brand-200' },
  Patient: { icon: User,        bg: 'bg-gray-50',   label: 'text-gray-600',   bubble: 'bg-gray-50 border-gray-200' },
  Unknown: { icon: User,        bg: 'bg-gray-50',   label: 'text-gray-500',   bubble: 'bg-gray-50 border-gray-200' },
};

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function TranscriptPanel({ lines, status }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Live Transcript</h2>
        <span className="text-xs text-gray-400">{lines.length} turn{lines.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {lines.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
            {status === 'idle' ? (
              <>
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <Stethoscope className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-sm text-gray-500">Start a consultation to see the transcript here</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                </div>
                <p className="text-sm text-gray-500">Listening for speech...</p>
              </>
            )}
          </div>
        )}

        {lines.map((line) => {
          const style = speakerStyles[line.speaker];
          const Icon = style.icon;
          return (
            <div key={line.id} className={`rounded-lg border p-3 ${style.bubble}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-3.5 h-3.5 ${style.label}`} />
                <span className={`text-xs font-semibold ${style.label}`}>{line.speaker}</span>
                <span className="text-xs text-gray-400 ml-auto">{formatTime(line.timestamp)}</span>
              </div>
              <p className="text-sm text-gray-800 leading-relaxed">{line.text}</p>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
