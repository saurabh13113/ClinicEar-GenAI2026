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

export default function ControlBar({ status, timerFormatted, onStartLive, onStartDemo, onEnd, onReset }: ControlBarProps) {
  const isRecording  = status === 'recording';
  const isProcessing = status === 'processing';
  const isIdle       = status === 'idle';
  const isDone       = status === 'done';

  return (
    <header className="shrink-0 z-20" style={{ background: '#0D1B2A' }}>
      <div className="flex items-center justify-between px-6 h-[62px]">

        {/* ── Logo ── */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl overflow-hidden ring-1 ring-white/10 shrink-0">
            <img src="/logo.jpg" alt="ClinicalEar" className="w-full h-full object-cover" />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold text-white tracking-tight" style={{ fontFamily: 'Sora, sans-serif' }}>
              ClinicalEar
            </div>
            <div className="text-[11px] font-medium" style={{ color: '#7B8FAB' }}>
              AI Clinical Note Generator
            </div>
          </div>
        </div>

        {/* ── Status pill (center) ── */}
        <div className="flex items-center gap-3">
          {(isRecording || isProcessing) && (
            <span
              className="font-mono text-sm font-semibold tabular-nums px-3 py-1 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.07)', color: '#CBD5E1', fontFamily: 'JetBrains Mono, monospace' }}
            >
              {timerFormatted}
            </span>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
            {isIdle && (
              <>
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                <span className="text-xs font-semibold" style={{ color: '#7B8FAB' }}>Ready</span>
              </>
            )}
            {isRecording && (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500 recording-ring" />
                <span className="text-xs font-semibold text-red-400">Recording</span>
              </>
            )}
            {isProcessing && (
              <>
                <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="text-xs font-semibold text-amber-400">Processing</span>
              </>
            )}
            {isDone && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-emerald-400">Complete</span>
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
                style={{ background: 'rgba(255,255,255,0.07)', color: '#94A3B8' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              >
                <Play className="w-3.5 h-3.5" />
                Demo Mode
              </button>
              <button
                onClick={onStartLive}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white rounded-xl transition-all duration-150 shadow-lg"
                style={{ background: '#1a56db', boxShadow: '0 0 0 1px rgba(26,86,219,0.5), 0 4px 12px rgba(26,86,219,0.35)' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1648c0')}
                onMouseLeave={e => (e.currentTarget.style.background = '#1a56db')}
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
              style={{ background: '#dc2626', boxShadow: '0 0 0 1px rgba(220,38,38,0.5), 0 4px 12px rgba(220,38,38,0.3)' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#b91c1c')}
              onMouseLeave={e => (e.currentTarget.style.background = '#dc2626')}
            >
              <MicOff className="w-4 h-4" />
              End Consultation
            </button>
          )}

          {isDone && (
            <button
              onClick={onReset}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-150"
              style={{ background: 'rgba(255,255,255,0.07)', color: '#94A3B8' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              New Session
            </button>
          )}

          {/* Track badges */}
          <div className="ml-2 pl-3 flex items-center gap-1.5" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(26,86,219,0.25)', color: '#93BBFF', border: '1px solid rgba(26,86,219,0.4)' }}>
              Sun Life
            </span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: '#7B8FAB', border: '1px solid rgba(255,255,255,0.1)' }}>
              IBM
            </span>
          </div>
        </div>
      </div>

      {/* Bottom accent line */}
      <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, #1a56db 30%, #1a56db 70%, transparent)' }} />
    </header>
  );
}
