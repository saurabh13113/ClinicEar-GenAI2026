import { useState } from 'react';
import { ClipboardCopy, Check, AlertTriangle, Loader2, FileText } from 'lucide-react';
import type { SOAPNote, SessionStatus } from '../types';

interface SOAPNotePanelProps {
  note: SOAPNote | null;
  status: SessionStatus;
}

const SECTIONS = [
  {
    key: 'subjective' as const,
    letter: 'S',
    label: 'Subjective',
    sublabel: 'Patient-reported symptoms',
    accentColor: '#3B82F6',
    bgColor: 'rgba(29, 78, 216, 0.1)',
    letterBg: 'rgba(29, 78, 216, 0.22)',
    letterColor: '#93BBFF',
    borderColor: 'rgba(29, 78, 216, 0.2)',
  },
  {
    key: 'objective' as const,
    letter: 'O',
    label: 'Objective',
    sublabel: 'Vitals & observations',
    accentColor: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.08)',
    letterBg: 'rgba(16, 185, 129, 0.2)',
    letterColor: '#6EE7B7',
    borderColor: 'rgba(16, 185, 129, 0.18)',
  },
  {
    key: 'assessment' as const,
    letter: 'A',
    label: 'Assessment',
    sublabel: 'Diagnosis',
    accentColor: '#8B5CF6',
    bgColor: 'rgba(139, 92, 246, 0.08)',
    letterBg: 'rgba(139, 92, 246, 0.2)',
    letterColor: '#C4B5FD',
    borderColor: 'rgba(139, 92, 246, 0.18)',
  },
  {
    key: 'plan' as const,
    letter: 'P',
    label: 'Plan',
    sublabel: 'Treatment & follow-up',
    accentColor: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.08)',
    letterBg: 'rgba(245, 158, 11, 0.18)',
    letterColor: '#FCD34D',
    borderColor: 'rgba(245, 158, 11, 0.18)',
  },
];

function ShimmerBlock({ height = 'h-4' }: { height?: string }) {
  return <div className={`${height} rounded-lg shimmer`} />;
}

export default function SOAPNotePanel({ note, status }: SOAPNotePanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!note) return;
    const text = SECTIONS.map((s) => `${s.label}\n${note[s.key]}`).join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#070D1C' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5 shrink-0"
        style={{ background: '#0A1628', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2.5">
          <FileText className="w-4 h-4" style={{ color: '#3B82F6' }} />
          <h2 className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>SOAP Note</h2>
          {note && (
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(16,185,129,0.12)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' }}
            >
              Generated
            </span>
          )}
        </div>
        {note && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150"
            style={
              copied
                ? { background: 'rgba(16,185,129,0.12)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' }
                : { background: '#1D4ED8', color: '#FFFFFF', boxShadow: '0 1px 6px rgba(29,78,216,0.35)' }
            }
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy Note'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">

        {/* Empty: idle */}
        {!note && status === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full gap-5 py-20 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <FileText className="w-7 h-7" style={{ color: '#2E4A66' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#3D5878' }}>No note generated</p>
              <p className="text-xs mt-1" style={{ color: '#2A3D56' }}>Start a consultation to generate a SOAP note</p>
            </div>
          </div>
        )}

        {/* Empty: recording */}
        {!note && status === 'recording' && (
          <div className="flex flex-col items-center justify-center h-full gap-5 py-20 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <FileText className="w-7 h-7" style={{ color: '#2E4A66' }} />
            </div>
            <p className="text-sm" style={{ color: '#3D5878' }}>Note will appear after the consultation ends</p>
          </div>
        )}

        {/* Processing skeleton */}
        {!note && status === 'processing' && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 mb-5">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#3B82F6' }} />
              <span className="text-sm font-medium" style={{ color: '#5A7FA8' }}>Generating SOAP note…</span>
            </div>
            {SECTIONS.map((s) => (
              <div
                key={s.key}
                className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center gap-3 px-4 py-3" style={{ background: s.bgColor }}>
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                    style={{ background: s.letterBg, color: s.letterColor }}
                  >
                    {s.letter}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <ShimmerBlock height="h-3" />
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2" style={{ background: '#0A1628' }}>
                  <ShimmerBlock height="h-3" />
                  <ShimmerBlock height="h-3" />
                  <div className="w-2/3"><ShimmerBlock height="h-3" /></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SOAP sections */}
        {note && SECTIONS.map((s) => {
          const conf = note.confidence_scores?.[s.key] ?? 1.0;
          const isLow = conf < 0.7;
          return (
            <div
              key={s.key}
              className="rounded-2xl overflow-hidden note-section"
              style={{
                border: isLow ? '1px solid rgba(245,158,11,0.25)' : `1px solid ${s.borderColor}`,
              }}
            >
              {/* Section header */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{
                  background: isLow ? 'rgba(245,158,11,0.07)' : s.bgColor,
                  borderBottom: `1px solid ${isLow ? 'rgba(245,158,11,0.15)' : s.borderColor}`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                    style={{
                      background: isLow ? 'rgba(245,158,11,0.18)' : s.letterBg,
                      color: isLow ? '#FCD34D' : s.letterColor,
                    }}
                  >
                    {s.letter}
                  </div>
                  <div>
                    <span className="text-xs font-semibold" style={{ color: '#E2E8F0' }}>{s.label}</span>
                    <span className="text-[10px] ml-2" style={{ color: '#2E4A66' }}>{s.sublabel}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={
                      isLow
                        ? { background: 'rgba(245,158,11,0.15)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.25)' }
                        : { background: 'rgba(16,185,129,0.12)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' }
                    }
                  >
                    {Math.round(conf * 100)}%
                  </span>
                </div>
              </div>

              {/* Section body */}
              <div className="px-5 py-3.5" style={{ background: '#0A1628' }}>
                <p className="clinical-text">{note[s.key] || '—'}</p>
              </div>
            </div>
          );
        })}

        {/* ICD-10 */}
        {note && note.icd10_suggestions.length > 0 && (
          <div
            className="rounded-2xl overflow-hidden note-section"
            style={{ border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div
              className="flex items-center gap-2.5 px-4 py-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.03)' }}
            >
              <span
                className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold"
                style={{ background: 'rgba(255,255,255,0.07)', color: '#5A7FA8' }}
              >
                Dx
              </span>
              <span className="text-xs font-semibold" style={{ color: '#E2E8F0' }}>ICD-10 Suggestions</span>
            </div>
            <div className="px-4 py-3 flex flex-wrap gap-2" style={{ background: '#0A1628' }}>
              {note.icd10_suggestions.map((code, i) => (
                <span
                  key={i}
                  className="mono-chip px-2.5 py-1 text-xs rounded-lg font-medium"
                  style={{ background: 'rgba(29,78,216,0.12)', color: '#93BBFF', border: '1px solid rgba(29,78,216,0.25)' }}
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Gaps */}
        {note && note.gaps.length > 0 && (
          <div
            className="rounded-2xl overflow-hidden note-section"
            style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: '1px solid rgba(245,158,11,0.15)' }}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-semibold" style={{ color: '#FCD34D' }}>Documentation Gaps</span>
            </div>
            <ul className="px-4 py-3 space-y-2">
              {note.gaps.map((gap, i) => (
                <li key={i} className="text-xs flex items-start gap-2" style={{ color: '#B8860B' }}>
                  <span className="mt-1 w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                  {gap}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
