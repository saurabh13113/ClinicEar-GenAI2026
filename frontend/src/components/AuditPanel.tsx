import { Shield, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { AuditResult } from '../types';

interface AuditPanelProps {
  audit: AuditResult | null;
  isLoading: boolean;
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? 'text-green-600' : score >= 60 ? 'text-yellow-600' : 'text-red-600';
  const bg    = score >= 80 ? 'bg-green-50'   : score >= 60 ? 'bg-yellow-50'   : 'bg-red-50';
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl ${bg} px-4 py-3 min-w-[80px]`}>
      <span className={`text-2xl font-bold ${color}`}>{score}</span>
      <span className="text-xs text-gray-500 mt-0.5">{label}</span>
    </div>
  );
}

export default function AuditPanel({ audit, isLoading }: AuditPanelProps) {
  return (
    <div className="border-t border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
        <Shield className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">IBM watsonx.ai — Quality Audit</span>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
            Running quality audit...
          </div>
        )}

        {!isLoading && !audit && (
          <p className="text-xs text-gray-400">Audit results will appear after note generation</p>
        )}

        {audit && (
          <div className="flex items-start gap-4">
            {/* Score rings */}
            <div className="flex gap-2 shrink-0">
              <ScoreRing score={audit.quality_score}      label="Quality" />
              <ScoreRing score={audit.completeness_score} label="Complete" />
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0 space-y-2">
              {/* Flagged terms */}
              {audit.flagged_terms.length > 0 ? (
                <div className="flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-xs font-medium text-gray-600">Flagged terms: </span>
                    <span className="text-xs text-gray-500">{audit.flagged_terms.join(', ')}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <span className="text-xs text-gray-500">No non-standard terminology flagged</span>
                </div>
              )}

              {/* Consistency */}
              {audit.consistency_notes && (
                <div className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-600">{audit.consistency_notes}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
