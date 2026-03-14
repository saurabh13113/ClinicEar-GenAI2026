import { ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { AuditResult } from '../types';

interface AuditPanelProps {
  audit: AuditResult | null;
  isLoading: boolean;
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';
  const textColor = score >= 80 ? '#047857' : score >= 60 ? '#B45309' : '#B91C1C';
  const bgColor = score >= 80 ? '#ECFDF5' : score >= 60 ? '#FFFBEB' : '#FEF2F2';
  const borderColor = score >= 80 ? '#A7F3D0' : score >= 60 ? '#FDE68A' : '#FECACA';

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl" style={{ background: bgColor, border: `1px solid ${borderColor}` }}>
        <span className="text-base font-bold leading-none" style={{ color: textColor, fontFamily: 'Sora, sans-serif' }}>
          {score}
        </span>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>{label}</div>
        <div className="w-28 h-1.5 rounded-full overflow-hidden" style={{ background: '#E8ECF4' }}>
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
    <div className="shrink-0" style={{ background: '#FFFFFF', borderTop: '1px solid #E8ECF4' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-2.5" style={{ borderBottom: '1px solid #F1F5F9' }}>
        <ShieldCheck className="w-3.5 h-3.5" style={{ color: '#475569' }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#475569' }}>
          IBM watsonx.ai — Quality Audit
        </span>
      </div>

      {/* Body */}
      <div className="px-5 py-3">
        {isLoading && (
          <div className="flex items-center gap-2.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#1a56db' }} />
            <span className="text-xs font-medium" style={{ color: '#94A3B8' }}>Running IBM watsonx.ai quality audit…</span>
          </div>
        )}

        {!isLoading && !audit && (
          <p className="text-xs" style={{ color: '#94A3B8' }}>
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
            <div className="w-px self-stretch shrink-0" style={{ background: '#E8ECF4' }} />

            {/* Details */}
            <div className="flex-1 min-w-0 space-y-2">
              {audit.flagged_terms.length > 0 ? (
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs font-semibold" style={{ color: '#92400E' }}>Flagged:</span>
                    {audit.flagged_terms.map((term, i) => (
                      <span
                        key={i}
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}
                      >
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <p className="text-xs font-medium" style={{ color: '#047857' }}>No non-standard terminology flagged</p>
                </div>
              )}
              {audit.consistency_notes && (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#1a56db' }} />
                  <p className="text-xs" style={{ color: '#64748B' }}>{audit.consistency_notes}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
