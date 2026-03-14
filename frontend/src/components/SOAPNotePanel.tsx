import { useState } from 'react';
import { ClipboardCopy, Check, AlertTriangle, Loader2, FileText } from 'lucide-react';
import type { SOAPNote, SessionStatus } from '../types';

interface SOAPNotePanelProps {
  note: SOAPNote | null;
  status: SessionStatus;
}

const SECTIONS = [
  { key: 'subjective' as const,  label: 'S — Subjective',  color: 'border-blue-400' },
  { key: 'objective' as const,   label: 'O — Objective',   color: 'border-green-400' },
  { key: 'assessment' as const,  label: 'A — Assessment',  color: 'border-purple-400' },
  { key: 'plan' as const,        label: 'P — Plan',        color: 'border-orange-400' },
];

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.7 ? 'text-green-600 bg-green-50' : 'text-yellow-700 bg-yellow-100';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {score < 0.7 && <AlertTriangle className="w-3 h-3" />}
      {pct}% confidence
    </span>
  );
}

function SectionCard({
  label,
  color,
  text,
  confidence,
}: {
  label: string;
  color: string;
  text: string;
  confidence: number;
}) {
  const isLowConf = confidence < 0.7;
  return (
    <div className={`rounded-lg border-l-4 border border-gray-200 ${color} ${isLowConf ? 'bg-yellow-50' : 'bg-white'} overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{label}</span>
        <ConfidenceBadge score={confidence} />
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{text || '—'}</p>
      </div>
    </div>
  );
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
    <div className="flex flex-col h-full bg-gray-50">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">SOAP Note</h2>
        {note && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 hover:bg-brand-50 rounded-lg transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy Note'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Empty / loading states */}
        {status === 'idle' && !note && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <FileText className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">Your SOAP note will appear here after the consultation</p>
          </div>
        )}

        {status === 'recording' && !note && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <FileText className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">Note will be generated when you end the consultation</p>
          </div>
        )}

        {status === 'processing' && !note && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
            <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
            <p className="text-sm text-gray-600 font-medium">Generating SOAP note...</p>
            <p className="text-xs text-gray-400">Claude is analyzing the conversation</p>
          </div>
        )}

        {/* Note sections */}
        {note && (
          <>
            {SECTIONS.map((s) => (
              <SectionCard
                key={s.key}
                label={s.label}
                color={s.color}
                text={note[s.key]}
                confidence={note.confidence_scores[s.key]}
              />
            ))}

            {/* ICD-10 suggestions */}
            {note.icd10_suggestions.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">ICD-10 Suggestions</span>
                </div>
                <div className="px-4 py-3 flex flex-wrap gap-2">
                  {note.icd10_suggestions.map((code, i) => (
                    <span key={i} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-mono">
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Gaps */}
            {note.gaps.length > 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 overflow-hidden">
                <div className="px-4 py-2 border-b border-yellow-200 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" />
                  <span className="text-xs font-semibold text-yellow-800 uppercase tracking-wide">Documentation Gaps</span>
                </div>
                <ul className="px-4 py-3 space-y-1">
                  {note.gaps.map((gap, i) => (
                    <li key={i} className="text-xs text-yellow-800 flex items-start gap-1.5">
                      <span className="mt-0.5">•</span>
                      <span>{gap}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
