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
    accentColor: '#1a56db',
    bgColor: '#EEF4FF',
    letterBg: '#DBEAFE',
    letterColor: '#1D4ED8',
  },
  {
    key: 'objective' as const,
    letter: 'O',
    label: 'Objective',
    sublabel: 'Vitals & observations',
    accentColor: '#059669',
    bgColor: '#ECFDF5',
    letterBg: '#D1FAE5',
    letterColor: '#047857',
  },
  {
    key: 'assessment' as const,
    letter: 'A',
    label: 'Assessment',
    sublabel: 'Diagnosis',
    accentColor: '#7C3AED',
    bgColor: '#F5F3FF',
    letterBg: '#EDE9FE',
    letterColor: '#6D28D9',
  },
  {
    key: 'plan' as const,
    letter: 'P',
    label: 'Plan',
    sublabel: 'Treatment & follow-up',
    accentColor: '#D97706',
    bgColor: '#FFFBEB',
    letterBg: '#FEF3C7',
    letterColor: '#B45309',
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
    <div className="flex flex-col h-full" style={{ background: '#F8FAFC' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5 shrink-0"
        style={{ background: '#FFFFFF', borderBottom: '1px solid #E8ECF4' }}
      >
        <div className="flex items-center gap-2.5">
          <FileText className="w-4 h-4" style={{ color: '#1a56db' }} />
          <h2 className="text-sm font-semibold" style={{ color: '#0D1B2A' }}>SOAP Note</h2>
          {note && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
              Generated
            </span>
          )}
        </div>
        {note && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150"
            style={copied
              ? { background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }
              : { background: '#1a56db', color: '#FFFFFF', boxShadow: '0 1px 4px rgba(26,86,219,0.3)' }
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
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#F0F2F7', border: '1px solid #E2E6EF' }}>
              <FileText className="w-7 h-7" style={{ color: '#CBD5E1' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#64748B' }}>No note generated</p>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Start a consultation to generate a SOAP note</p>
            </div>
          </div>
        )}

        {/* Empty: recording */}
        {!note && status === 'recording' && (
          <div className="flex flex-col items-center justify-center h-full gap-5 py-20 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#F0F2F7', border: '1px solid #E2E6EF' }}>
              <FileText className="w-7 h-7" style={{ color: '#CBD5E1' }} />
            </div>
            <p className="text-sm" style={{ color: '#94A3B8' }}>Note will appear after the consultation ends</p>
          </div>
        )}

        {/* Processing skeleton */}
        {!note && status === 'processing' && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 mb-5">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#1a56db' }} />
              <span className="text-sm font-medium" style={{ color: '#64748B' }}>Generating SOAP note…</span>
            </div>
            {SECTIONS.map((s) => (
              <div key={s.key} className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E8ECF4' }}>
                <div className="flex items-center gap-3 px-4 py-3" style={{ background: s.bgColor, borderBottom: `1px solid ${s.bgColor}` }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm" style={{ background: s.letterBg, color: s.letterColor }}>
                    {s.letter}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <ShimmerBlock height="h-3" />
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <ShimmerBlock height="h-3" />
                  <ShimmerBlock height="h-3" />
                  <div className="w-2/3"><ShimmerBlock height="h-3" /></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SOAP sections */}
        {note && SECTIONS.map((s, i) => {
          const conf = note.confidence_scores[s.key];
          const isLow = conf < 0.7;
          return (
            <div
              key={s.key}
              className="rounded-2xl overflow-hidden note-section"
              style={{
                background: '#FFFFFF',
                border: isLow ? '1px solid #FDE68A' : '1px solid #E8ECF4',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              {/* Section header */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{
                  background: isLow ? '#FFFBEB' : s.bgColor,
                  borderBottom: `1px solid ${isLow ? '#FDE68A' : s.bgColor}`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                    style={{ background: isLow ? '#FEF3C7' : s.letterBg, color: isLow ? '#B45309' : s.letterColor }}
                  >
                    {s.letter}
                  </div>
                  <div>
                    <span className="text-xs font-semibold" style={{ color: '#0D1B2A' }}>{s.label}</span>
                    <span className="text-[10px] ml-2" style={{ color: '#94A3B8' }}>{s.sublabel}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={isLow
                      ? { background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }
                      : { background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }
                    }
                  >
                    {Math.round(conf * 100)}%
                  </span>
                </div>
              </div>

              {/* Section body */}
              <div className="px-5 py-3.5">
                <p className="clinical-text">{note[s.key] || '—'}</p>
              </div>
            </div>
          );
        })}

        {/* ICD-10 */}
        {note && note.icd10_suggestions.length > 0 && (
          <div
            className="rounded-2xl overflow-hidden note-section"
            style={{ background: '#FFFFFF', border: '1px solid #E8ECF4', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
              <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold" style={{ background: '#E2E8F0', color: '#475569' }}>
                Dx
              </span>
              <span className="text-xs font-semibold" style={{ color: '#0D1B2A' }}>ICD-10 Suggestions</span>
            </div>
            <div className="px-4 py-3 flex flex-wrap gap-2">
              {note.icd10_suggestions.map((code, i) => (
                <span
                  key={i}
                  className="mono-chip px-2.5 py-1 text-xs rounded-lg font-medium"
                  style={{ background: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0' }}
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
            style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}
          >
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid #FDE68A' }}>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-xs font-semibold" style={{ color: '#92400E' }}>Documentation Gaps</span>
            </div>
            <ul className="px-4 py-3 space-y-2">
              {note.gaps.map((gap, i) => (
                <li key={i} className="text-xs flex items-start gap-2" style={{ color: '#78350F' }}>
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
