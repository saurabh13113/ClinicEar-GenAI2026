import { Heart, Pill, Calendar, Phone, BookOpen, CheckCircle2, Loader2, FileHeart, ExternalLink, Youtube, AlertCircle } from 'lucide-react';
import type { SOAPNote, SessionStatus } from '../types';

interface PatientSummaryPanelProps {
  note: SOAPNote | null;
  status: SessionStatus;
}

function ShimmerBlock({ height = 'h-4', width = 'w-full' }: { height?: string; width?: string }) {
  return <div className={`${height} ${width} rounded shimmer`} />;
}

function buildYouTubeUrl(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function buildMedlinePlusUrl(query: string) {
  return `https://medlineplus.gov/search/?query=${encodeURIComponent(query)}`;
}

export default function PatientSummaryPanel({ note, status }: PatientSummaryPanelProps) {
  const instructions = note?.patient_instructions ?? [];
  const resourceQueries = note?.resource_queries ?? [];

  return (
    <div className="flex flex-col h-full tab-panel-enter" style={{ background: '#070D1C' }}>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

        {/* ── Empty: idle ── */}
        {!note && status === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full gap-5 py-24 text-center">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(244,114,182,0.07)', border: '1px solid rgba(244,114,182,0.15)' }}
            >
              <FileHeart className="w-6 h-6" style={{ color: 'rgba(244,114,182,0.35)' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#2E4A66' }}>No summary yet</p>
              <p className="text-xs mt-1" style={{ color: '#1A2E44' }}>
                A patient-friendly summary will appear after the consultation
              </p>
            </div>
          </div>
        )}

        {/* ── Empty: recording ── */}
        {!note && status === 'recording' && (
          <div className="flex flex-col items-center justify-center h-full gap-5 py-24 text-center">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(244,114,182,0.05)', border: '1px solid rgba(244,114,182,0.12)' }}
            >
              <FileHeart className="w-6 h-6" style={{ color: 'rgba(244,114,182,0.3)' }} />
            </div>
            <p className="text-sm" style={{ color: '#2E4A66' }}>
              Summary will appear after the consultation ends
            </p>
          </div>
        )}

        {/* ── Processing skeleton ── */}
        {!note && status === 'processing' && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 mb-4">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#F472B6' }} />
              <span className="text-sm font-medium" style={{ color: '#4A7FA8' }}>Preparing patient summary…</span>
            </div>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="px-4 py-2.5 flex items-center gap-3" style={{ background: 'rgba(244,114,182,0.05)' }}>
                  <div className="w-6 h-6 rounded shrink-0 shimmer" />
                  <ShimmerBlock height="h-3" width="w-32" />
                </div>
                <div className="px-4 py-3 space-y-2" style={{ background: '#0A1628' }}>
                  <ShimmerBlock height="h-3" />
                  <ShimmerBlock height="h-3" />
                  <ShimmerBlock height="h-3" width="w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Main content ── */}
        {note && (
          <>
            {/* Welcome banner */}
            <div
              className="rounded-xl p-4 note-section"
              style={{ background: 'rgba(244,114,182,0.07)', border: '1px solid rgba(244,114,182,0.15)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4" style={{ color: '#F472B6' }} />
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#F9A8D4' }}>
                  Your Visit Summary
                </span>
              </div>
              <p style={{ fontFamily: 'Lora, Georgia, serif', fontSize: '13px', lineHeight: '1.75', color: '#7A9AB8' }}>
                Thank you for your visit today. Below is a plain-language summary of what was
                discussed, along with your care instructions. Please keep this for your records.
              </p>
            </div>

            {/* What We Discussed */}
            <SummaryCard
              icon={<BookOpen className="w-4 h-4" />}
              title="What We Discussed Today"
              accentColor="#93BBFF"
              bgColor="rgba(29,78,216,0.08)"
              borderColor="rgba(29,78,216,0.2)"
            >
              <p style={{ fontFamily: 'Lora, Georgia, serif', fontSize: '13.5px', lineHeight: '1.8', color: '#7A9AB8' }}>
                {note.subjective || 'See your doctor\'s notes for details.'}
              </p>
            </SummaryCard>

            {/* What the Doctor Found */}
            <SummaryCard
              icon={<Heart className="w-4 h-4" />}
              title="What the Doctor Found"
              accentColor="#6EE7B7"
              bgColor="rgba(16,185,129,0.08)"
              borderColor="rgba(16,185,129,0.2)"
            >
              <p style={{ fontFamily: 'Lora, Georgia, serif', fontSize: '13.5px', lineHeight: '1.8', color: '#7A9AB8' }}>
                {note.assessment || 'Your doctor will discuss findings with you.'}
              </p>
            </SummaryCard>

            {/* ── Medication / Care Instructions ── */}
            {instructions.length > 0 && (
              <SummaryCard
                icon={<Pill className="w-4 h-4" />}
                title="Your Care Instructions"
                badge="Follow These Steps"
                accentColor="#FCD34D"
                bgColor="rgba(217,119,6,0.08)"
                borderColor="rgba(217,119,6,0.22)"
              >
                <ul className="space-y-2.5 mt-1">
                  {instructions.map((instr, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span
                        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black mt-0.5"
                        style={{ background: 'rgba(217,119,6,0.18)', color: '#FCD34D', fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ fontFamily: 'Lora, Georgia, serif', fontSize: '13px', lineHeight: '1.7', color: '#7A9AB8' }}>
                        {instr}
                      </span>
                    </li>
                  ))}
                </ul>
              </SummaryCard>
            )}

            {/* Treatment Plan (fallback if no instructions) */}
            {instructions.length === 0 && (
              <SummaryCard
                icon={<Pill className="w-4 h-4" />}
                title="Your Treatment Plan"
                accentColor="#FCD34D"
                bgColor="rgba(217,119,6,0.08)"
                borderColor="rgba(217,119,6,0.2)"
              >
                <p style={{ fontFamily: 'Lora, Georgia, serif', fontSize: '13.5px', lineHeight: '1.8', color: '#7A9AB8' }}>
                  {note.plan || 'Follow the instructions provided by your care team.'}
                </p>
              </SummaryCard>
            )}

            {/* Follow-up */}
            <SummaryCard
              icon={<Calendar className="w-4 h-4" />}
              title="Follow-Up Appointment"
              accentColor="#C4B5FD"
              bgColor="rgba(139,92,246,0.08)"
              borderColor="rgba(139,92,246,0.2)"
            >
              <p style={{ fontFamily: 'Lora, Georgia, serif', fontSize: '13.5px', lineHeight: '1.8', color: '#7A9AB8' }}>
                Please attend your scheduled follow-up appointment. Contact your care team if you
                have questions or concerns before then.
              </p>
            </SummaryCard>

            {/* Emergency signs */}
            <SummaryCard
              icon={<AlertCircle className="w-4 h-4" />}
              title="When to Seek Urgent Help"
              accentColor="#FCA5A5"
              bgColor="rgba(239,68,68,0.06)"
              borderColor="rgba(239,68,68,0.18)"
            >
              <p style={{ fontFamily: 'Lora, Georgia, serif', fontSize: '13.5px', lineHeight: '1.8', color: '#7A9AB8' }}>
                Go to the emergency room or call 911 if your symptoms suddenly worsen, you have
                difficulty breathing, chest pain, or feel faint.
              </p>
            </SummaryCard>

            {/* ── Resource Links ── */}
            {resourceQueries.length > 0 && (
              <div
                className="rounded-xl overflow-hidden note-section"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {/* Header */}
                <div
                  className="flex items-center gap-2.5 px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <Youtube className="w-4 h-4" style={{ color: '#FF4444' }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#94A3B8' }}>
                    Learn More
                  </span>
                  <span className="text-[10px]" style={{ color: '#1E3A5A' }}>— helpful videos &amp; resources</span>
                </div>

                {/* Links */}
                <div className="px-4 py-3 space-y-2.5" style={{ background: '#0A1628' }}>
                  {resourceQueries.map((query, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      {/* YouTube link */}
                      <a
                        href={buildYouTubeUrl(query)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 transition-all duration-150 hover:opacity-90"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}
                      >
                        <Youtube className="w-3.5 h-3.5 shrink-0" style={{ color: '#FF4444' }} />
                        <span className="text-xs flex-1 truncate" style={{ color: '#94A3B8' }}>{query}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" style={{ color: '#4A3030' }} />
                      </a>

                      {/* MedlinePlus link */}
                      <a
                        href={buildMedlinePlusUrl(query)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg transition-all duration-150 hover:opacity-90 shrink-0"
                        style={{ background: 'rgba(29,78,216,0.1)', border: '1px solid rgba(29,78,216,0.22)' }}
                        title="Search MedlinePlus"
                      >
                        <Phone className="w-3.5 h-3.5" style={{ color: '#60A5FA' }} />
                        <span className="text-[10px] font-semibold" style={{ color: '#60A5FA' }}>MedlinePlus</span>
                        <ExternalLink className="w-3 h-3" style={{ color: '#1E3A5A' }} />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ICD-10 codes */}
            {note.icd10_suggestions.length > 0 && (
              <div
                className="rounded-xl overflow-hidden note-section"
                style={{ border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div
                  className="flex items-center gap-2.5 px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <span
                    className="text-[9px] font-black px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(255,255,255,0.07)', color: '#3D5878', fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    Dx
                  </span>
                  <span className="text-xs font-semibold" style={{ color: '#4A6A88' }}>Diagnosis Codes</span>
                </div>
                <div className="px-4 py-3 flex flex-wrap gap-2" style={{ background: '#0A1628' }}>
                  {note.icd10_suggestions.map((code, i) => (
                    <span
                      key={i}
                      className="mono-chip px-2.5 py-1 text-xs rounded-lg font-medium"
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#4A6A88', border: '1px solid rgba(255,255,255,0.09)' }}
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

// ── Reusable card ──────────────────────────────────────────────────────────────

interface SummaryCardProps {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  accentColor: string;
  bgColor: string;
  borderColor: string;
  children: React.ReactNode;
}

function SummaryCard({ icon, title, badge, accentColor, bgColor, borderColor, children }: SummaryCardProps) {
  return (
    <div className="rounded-xl overflow-hidden note-section" style={{ border: `1px solid ${borderColor}` }}>
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: bgColor, borderBottom: `1px solid ${borderColor}` }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: accentColor }}>{icon}</span>
          <span className="text-xs font-bold" style={{ color: accentColor }}>{title}</span>
        </div>
        {badge && (
          <span
            className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded"
            style={{ background: `${accentColor}18`, color: accentColor, border: `1px solid ${accentColor}30` }}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="px-4 py-3.5" style={{ background: '#0A1628' }}>
        {children}
      </div>
    </div>
  );
}
