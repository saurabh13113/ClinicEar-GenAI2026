import { Mic, MicOff, Play, Loader2, RotateCcw, Timer } from 'lucide-react';
import type { SessionStatus } from '../types';

interface ControlBarProps {
  status: SessionStatus;
  timerFormatted: string;
  turnCount?: number;
  onStartLive: () => void;
  onStartDemo: () => void;
  onEnd: () => void;
  onReset: () => void;
}

export default function ControlBar({
  status,
  timerFormatted,
  turnCount,
  onStartLive,
  onStartDemo,
  onEnd,
  onReset,
}: ControlBarProps) {
  const isRecording  = status === 'recording';
  const isProcessing = status === 'processing';
  const isIdle       = status === 'idle';
  const isDone       = status === 'done';

  // Accent line gradient changes with session state
  const accentLine = isRecording
    ? 'linear-gradient(90deg, transparent, rgba(239,68,68,0.8) 25%, #EF4444 50%, rgba(239,68,68,0.8) 75%, transparent)'
    : isProcessing
    ? 'linear-gradient(90deg, transparent, rgba(245,158,11,0.6) 30%, #F59E0B 50%, rgba(245,158,11,0.6) 70%, transparent)'
    : isDone
    ? 'linear-gradient(90deg, transparent, rgba(16,185,129,0.6) 30%, #10B981 50%, rgba(16,185,129,0.6) 70%, transparent)'
    : 'linear-gradient(90deg, transparent, rgba(29,78,216,0.5) 30%, #1D4ED8 50%, rgba(29,78,216,0.5) 70%, transparent)';

  return (
    <header
      className="shrink-0 z-20"
      style={{ background: '#050C1A', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-center justify-between px-6 h-[60px]">

        {/* ── Logo ── */}
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl overflow-hidden shrink-0"
            style={{
              boxShadow: isRecording
                ? '0 0 0 2px rgba(239,68,68,0.5), 0 0 12px rgba(239,68,68,0.2)'
                : '0 0 0 1px rgba(255,255,255,0.08)',
              transition: 'box-shadow 0.4s ease',
            }}
          >
            <img src="/logo.jpg" alt="ClinicalEar" className="w-full h-full object-cover" />
          </div>
          <div className="leading-tight">
            <div
              className="text-[15px] font-bold tracking-tight"
              style={{ color: '#E2E8F0', fontFamily: 'Sora, sans-serif' }}
            >
              ClinicalEar
            </div>
            <div className="text-[10px] font-medium" style={{ color: '#1E3A5A' }}>
              AI Clinical Note Generator
            </div>
          </div>
        </div>

        {/* ── Center: Timer + Status ── */}
        <div className="flex items-center gap-3">
          {/* Timer */}
          {(isRecording || isProcessing || isDone) && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <Timer className="w-3 h-3" style={{ color: '#2E4A66' }} />
              <span
                className="text-sm font-semibold tabular-nums"
                style={{ color: '#5A7FA8', fontFamily: 'JetBrains Mono, monospace' }}
              >
                {timerFormatted}
              </span>
            </div>
          )}

          {/* Turn count */}
          {(isRecording || isDone) && turnCount !== undefined && turnCount > 0 && (
            <div
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#3D5878', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {turnCount} turns
            </div>
          )}

          {/* Status pill */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {isIdle && (
              <>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#1E3A5A' }} />
                <span className="text-xs font-semibold" style={{ color: '#2E4A66' }}>Ready</span>
              </>
            )}
            {isRecording && (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500 recording-ring" />
                <span className="text-xs font-bold text-red-400">Recording</span>
              </>
            )}
            {isProcessing && (
              <>
                <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="text-xs font-bold text-amber-400">Processing</span>
              </>
            )}
            {isDone && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-emerald-400">Complete</span>
              </>
            )}
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center gap-2">
          {isIdle && (
            <>
              <button
                onClick={onStartDemo}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-150"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#3D5878', border: '1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = '#93BBFF'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#3D5878'; }}
              >
                <Play className="w-3.5 h-3.5" />
                Demo Mode
              </button>
              <button
                onClick={onStartLive}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white rounded-xl transition-all duration-150"
                style={{ background: '#1D4ED8', boxShadow: '0 0 0 1px rgba(29,78,216,0.5), 0 4px 14px rgba(29,78,216,0.3)' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1E40AF')}
                onMouseLeave={e => (e.currentTarget.style.background = '#1D4ED8')}
              >
                <Mic className="w-4 h-4" />
                Start Consultation
              </button>
            </>
          )}

          {isRecording && (
            <button
              onClick={onEnd}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white rounded-xl transition-all duration-150"
              style={{ background: '#DC2626', boxShadow: '0 0 0 1px rgba(220,38,38,0.5), 0 4px 14px rgba(220,38,38,0.25)' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#B91C1C')}
              onMouseLeave={e => (e.currentTarget.style.background = '#DC2626')}
            >
              <MicOff className="w-4 h-4" />
              End Consultation
            </button>
          )}

          {isDone && (
            <button
              onClick={onReset}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-150"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#3D5878', border: '1px solid rgba(255,255,255,0.08)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = '#93BBFF'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#3D5878'; }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              New Session
            </button>
          )}

          {/* Track badges */}
          <div
            className="ml-2 pl-3 flex items-center gap-1.5"
            style={{ borderLeft: '1px solid rgba(255,255,255,0.07)' }}
          >
            <span
              className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{ background: 'rgba(29,78,216,0.18)', color: '#93BBFF', border: '1px solid rgba(29,78,216,0.3)' }}
            >
              Sun Life
            </span>
            <span
              className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#2E4A66', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              IBM
            </span>
          </div>
        </div>
      </div>

      {/* Bottom accent line — changes color with session state */}
      <div
        className="h-px"
        style={{ background: accentLine, transition: 'background 0.5s ease' }}
      />
    </header>
  );
}
