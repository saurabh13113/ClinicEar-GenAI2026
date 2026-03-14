import { ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { AuditResult } from '../types';

interface AuditPanelProps {
  audit: AuditResult | null;
  isLoading: boolean;
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const isHigh = score >= 80;
  const isMid  = score >= 60 && score < 80;
  const color      = isHigh ? '#10B981' : isMid ? '#F59E0B' : '#EF4444';
  const textColor  = isHigh ? '#6EE7B7' : isMid ? '#FCD34D' : '#FCA5A5';
  const bgColor    = isHigh ? 'rgba(16,185,129,0.1)'  : isMid ? 'rgba(245,158,11,0.1)'  : 'rgba(239,68,68,0.1)';
  const borderColor = isHigh ? 'rgba(16,185,129,0.2)' : isMid ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)';

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex flex-col items-center justify-center w-12 h-12 rounded-xl"
        style={{ background: bgColor, border: `1px solid ${borderColor}` }}
      >
        <span className="text-base font-bold leading-none" style={{ color: textColor, fontFamily: 'Sora, sans-serif' }}>
          {score}
        </span>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#2E4A66' }}>
          {label}
        </div>
        <div className="w-28 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full score-bar-fill"
            style={{ width: `${score}%`, background: color }}
          />
        </div>
      </div>
    </div>
  );
}

export default function AuditPanel({ audit, isLoading }: AuditPanelProps) {
  return (
    <div className="shrink-0" style={{ background: '#07101E', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-5 py-2"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <ShieldCheck className="w-3 h-3" style={{ color: '#2E4A66' }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#2E4A66' }}>
          IBM watsonx.ai — Quality Audit
        </span>
      </div>

      {/* Body */}
      <div className="px-5 py-3">
        {isLoading && (
          <div className="flex items-center gap-2.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#3B82F6' }} />
            <span className="text-xs font-medium" style={{ color: '#3D5878' }}>
              Running IBM watsonx.ai quality audit…
            </span>
          </div>
        )}

        {!isLoading && !audit && (
          <p className="text-xs" style={{ color: '#2E4A66' }}>
            Audit results will appear after note generation.
          </p>
        )}

        {audit && (
          <div className="flex items-center gap-8">
            {/* Scores */}
            <div className="flex items-center gap-6 shrink-0">
              <ScoreGauge score={audit.quality_score} label="Quality" />
              <ScoreGauge score={audit.completeness_score} label="Completeness" />
            </div>

            {/* Divider */}
            <div className="w-px self-stretch shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }} />

            {/* Details */}
            <div className="flex-1 min-w-0 space-y-2">
              {audit.flagged_terms.length > 0 ? (
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs font-semibold" style={{ color: '#FCD34D' }}>Flagged:</span>
                    {audit.flagged_terms.map((term, i) => (
                      <span
                        key={i}
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(245,158,11,0.12)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.2)' }}
                      >
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <p className="text-xs font-medium" style={{ color: '#6EE7B7' }}>
                    No non-standard terminology flagged
                  </p>
                </div>
              )}
              {audit.consistency_notes && (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#3B82F6' }} />
                  <p className="text-xs" style={{ color: '#5A7FA8' }}>{audit.consistency_notes}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
