import { Mic, MicOff, Play, Loader2, RotateCcw } from 'lucide-react';
import type { SessionStatus } from '../types';

interface ControlBarProps {
  status: SessionStatus;
  timerFormatted: string;
  onStartLive: () => void;
  onStartDemo: () => void;
  onEnd: () => void;
  onReset: () => void;
}

const statusConfig: Record<SessionStatus, { label: string; color: string }> = {
  idle:       { label: 'Ready',      color: 'bg-gray-100 text-gray-600' },
  recording:  { label: 'Recording',  color: 'bg-red-100 text-red-700' },
  processing: { label: 'Processing', color: 'bg-yellow-100 text-yellow-700' },
  done:       { label: 'Complete',   color: 'bg-green-100 text-green-700' },
};

export default function ControlBar({
  status,
  timerFormatted,
  onStartLive,
  onStartDemo,
  onEnd,
  onReset,
}: ControlBarProps) {
  const { label, color } = statusConfig[status];
  const isRecording = status === 'recording';
  const isProcessing = status === 'processing';
  const isIdle = status === 'idle';
  const isDone = status === 'done';

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-600">
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-700 text-gray-900 leading-tight" style={{ fontWeight: 700 }}>ClinicalEar</h1>
          <p className="text-xs text-gray-500">AI Clinical Note Generator</p>
        </div>
      </div>

      {/* Center controls */}
      <div className="flex items-center gap-3">
        {/* Status badge */}
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${color}`}>
          {isRecording && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          )}
          {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
          {label}
        </span>

        {/* Timer */}
        {(isRecording || isProcessing) && (
          <span className="font-mono text-sm text-gray-600 tabular-nums">{timerFormatted}</span>
        )}

        {/* Action buttons */}
        {isIdle && (
          <>
            <button
              onClick={onStartLive}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Mic className="w-4 h-4" />
              Start Consultation
            </button>
            <button
              onClick={onStartDemo}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              <Play className="w-4 h-4" />
              Demo Mode
            </button>
          </>
        )}

        {isRecording && (
          <button
            onClick={onEnd}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <MicOff className="w-4 h-4" />
            End Consultation
          </button>
        )}

        {isDone && (
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            New Session
          </button>
        )}
      </div>

      {/* Right: GenAI Genesis badge */}
      <div className="text-right">
        <p className="text-xs font-medium text-brand-600">GenAI Genesis 2026</p>
        <p className="text-xs text-gray-400">Sun Life · IBM Tracks</p>
      </div>
    </header>
  );
}
