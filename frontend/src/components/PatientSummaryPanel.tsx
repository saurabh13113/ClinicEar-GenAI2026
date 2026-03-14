import { Heart, Pill, Calendar, Phone, BookOpen, CheckCircle2, Loader2, FileHeart } from 'lucide-react';
import type { SOAPNote, SessionStatus } from '../types';

interface PatientSummaryPanelProps {
  note: SOAPNote | null;
  status: SessionStatus;
}

interface SummaryCard {
  icon: React.ReactNode;
  title: string;
  content: string;
  accentColor: string;
  bgColor: string;
  borderColor: string;
}

/** Derive plain-language cards from existing SOAP note fields. */
function buildSummaryCards(note: SOAPNote): SummaryCard[] {
  return [
    {
      icon: <BookOpen className="w-4 h-4" />,
      title: 'What We Discussed Today',
      content: note.subjective || 'See your doctor\'s notes for details.',
      accentColor: '#93BBFF',
      bgColor: 'rgba(29, 78, 216, 0.08)',
      borderColor: 'rgba(29, 78, 216, 0.2)',
    },
    {
      icon: <Heart className="w-4 h-4" />,
      title: 'What the Doctor Found',
      content: note.assessment || 'Your doctor will discuss findings with you.',
      accentColor: '#6EE7B7',
      bgColor: 'rgba(16, 185, 129, 0.08)',
      borderColor: 'rgba(16, 185, 129, 0.2)',
    },
    {
      icon: <Pill className="w-4 h-4" />,
      title: 'Your Treatment Plan',
      content: note.plan || 'Follow the instructions provided by your care team.',
      accentColor: '#FCD34D',
      bgColor: 'rgba(245, 158, 11, 0.08)',
      borderColor: 'rgba(245, 158, 11, 0.2)',
    },
    {
      icon: <Calendar className="w-4 h-4" />,
      title: 'Follow-Up',
      content:
        'Please attend your scheduled follow-up appointment. Contact your care team if you have questions before then.',
      accentColor: '#C4B5FD',
      bgColor: 'rgba(139, 92, 246, 0.08)',
      borderColor: 'rgba(139, 92, 246, 0.2)',
    },
    {
      icon: <Phone className="w-4 h-4" />,
      title: 'When to Seek Urgent Help',
      content:
        'Go to the emergency room or call 911 if your symptoms suddenly worsen, you have difficulty breathing, chest pain, or feel faint.',
      accentColor: '#FCA5A5',
      bgColor: 'rgba(239, 68, 68, 0.06)',
      borderColor: 'rgba(239, 68, 68, 0.18)',
    },
  ];
}

function ShimmerBlock({ height = 'h-4' }: { height?: string }) {
  return <div className={`${height} rounded-lg shimmer`} />;
}

export default function PatientSummaryPanel({ note, status }: PatientSummaryPanelProps) {
  const cards = note ? buildSummaryCards(note) : [];

  return (
    <div className="flex flex-col h-full tab-panel-enter" style={{ background: '#070D1C' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5 shrink-0"
        style={{ background: '#0A1628', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2.5">
          <FileHeart className="w-4 h-4" style={{ color: '#F472B6' }} />
          <h2 className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>Patient Summary</h2>
          {note && (
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(244, 114, 182, 0.1)',
                color: '#F9A8D4',
                border: '1px solid rgba(244,114,182,0.2)',
              }}
            >
              Ready
            </span>
          )}
        </div>
        <span className="text-[10px] font-medium" style={{ color: '#1E3A5A' }}>
          Plain-language take-home
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">

        {/* Empty: idle */}
        {!note && status === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full gap-5 py-20 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(244,114,182,0.07)', border: '1px solid rgba(244,114,182,0.15)' }}
            >
              <FileHeart className="w-7 h-7" style={{ color: 'rgba(244,114,182,0.4)' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#3D5878' }}>No summary yet</p>
              <p className="text-xs mt-1" style={{ color: '#243650' }}>
                A patient-friendly summary will appear after the consultation
              </p>
            </div>
          </div>
        )}

        {/* Empty: recording */}
        {!note && status === 'recording' && (
          <div className="flex flex-col items-center justify-center h-full gap-5 py-20 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(244,114,182,0.05)', border: '1px solid rgba(244,114,182,0.12)' }}
            >
              <FileHeart className="w-7 h-7" style={{ color: 'rgba(244,114,182,0.3)' }} />
            </div>
            <p className="text-sm" style={{ color: '#3D5878' }}>
              Summary will appear after the consultation ends
            </p>
          </div>
        )}

        {/* Processing skeleton */}
        {!note && status === 'processing' && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 mb-5">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#F472B6' }} />
              <span className="text-sm font-medium" style={{ color: '#5A7FA8' }}>Preparing patient summary…</span>
            </div>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'rgba(244,114,182,0.05)' }}>
                  <div
                    className="w-7 h-7 rounded-lg shrink-0"
                    style={{ background: 'rgba(244,114,182,0.1)' }}
                  />
                  <div className="flex-1 space-y-1.5">
                    <ShimmerBlock height="h-3" />
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2" style={{ background: '#0A1628' }}>
                  <ShimmerBlock height="h-3" />
                  <ShimmerBlock height="h-3" />
                  <div className="w-3/4"><ShimmerBlock height="h-3" /></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary cards */}
        {note && (
          <>
            {/* Greeting banner */}
            <div
              className="rounded-2xl p-4 note-section"
              style={{ background: 'rgba(244,114,182,0.07)', border: '1px solid rgba(244,114,182,0.15)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4" style={{ color: '#F472B6' }} />
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: '#F9A8D4' }}
                >
                  Your Visit Summary
                </span>
              </div>
              <p
                style={{
                  fontFamily: 'Lora, Georgia, serif',
                  fontSize: '13px',
                  lineHeight: '1.75',
                  color: '#8BA8C8',
                }}
              >
                Thank you for your visit today. Below is a plain-language summary of what was
                discussed. Please keep this for your records and bring it to your next appointment.
              </p>
            </div>

            {/* Content cards */}
            {cards.map((card, i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden note-section"
                style={{ border: `1px solid ${card.borderColor}` }}
              >
                <div
                  className="flex items-center gap-2.5 px-4 py-3"
                  style={{
                    background: card.bgColor,
                    borderBottom: `1px solid ${card.borderColor}`,
                  }}
                >
                  <span style={{ color: card.accentColor }}>{card.icon}</span>
                  <span className="text-xs font-semibold" style={{ color: card.accentColor }}>
                    {card.title}
                  </span>
                </div>
                <div className="px-5 py-3.5" style={{ background: '#0A1628' }}>
                  <p
                    style={{
                      fontFamily: 'Lora, Georgia, serif',
                      fontSize: '13.5px',
                      lineHeight: '1.8',
                      color: '#8BA8C8',
                    }}
                  >
                    {card.content}
                  </p>
                </div>
              </div>
            ))}

            {/* ICD-10 codes in plain language */}
            {note.icd10_suggestions.length > 0 && (
              <div
                className="rounded-2xl overflow-hidden note-section"
                style={{ border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div
                  className="flex items-center gap-2.5 px-4 py-3"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.07)', color: '#3D5878' }}>
                    Dx
                  </span>
                  <span className="text-xs font-semibold" style={{ color: '#5A7FA8' }}>Diagnosis Codes</span>
                </div>
                <div className="px-4 py-3 flex flex-wrap gap-2" style={{ background: '#0A1628' }}>
                  {note.icd10_suggestions.map((code, i) => (
                    <span
                      key={i}
                      className="mono-chip px-2.5 py-1 text-xs rounded-lg font-medium"
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#5A7FA8', border: '1px solid rgba(255,255,255,0.09)' }}
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
