import { useState } from 'react';
import { Mail, Check, AlertTriangle, Loader2, FileText, User, Calendar, Hash } from 'lucide-react';
import type { SOAPNote, SessionStatus, Patient } from '../types';
import jsPDF from 'jspdf';

interface SOAPNotePanelProps {
  note: SOAPNote | null;
  status: SessionStatus;
  patient?: Patient;
  showHeader?: boolean;
}

const SECTIONS = [
  {
    key: 'subjective' as const,
    code: 'S',
    label: 'SUBJECTIVE',
    sublabel: 'Chief Complaint & History of Present Illness',
    accentColor: '#60A5FA',
    bgColor: 'rgba(37, 99, 235, 0.07)',
    codeBg: 'rgba(37, 99, 235, 0.18)',
    codeColor: '#93BBFF',
    borderLeft: '#2563EB',
    borderColor: 'rgba(37, 99, 235, 0.18)',
  },
  {
    key: 'objective' as const,
    code: 'O',
    label: 'OBJECTIVE',
    sublabel: 'Vitals, Physical Examination & Diagnostic Findings',
    accentColor: '#34D399',
    bgColor: 'rgba(5, 150, 105, 0.07)',
    codeBg: 'rgba(5, 150, 105, 0.18)',
    codeColor: '#6EE7B7',
    borderLeft: '#059669',
    borderColor: 'rgba(5, 150, 105, 0.18)',
  },
  {
    key: 'assessment' as const,
    code: 'A',
    label: 'ASSESSMENT',
    sublabel: 'Diagnosis & Clinical Impression',
    accentColor: '#A78BFA',
    bgColor: 'rgba(109, 40, 217, 0.07)',
    codeBg: 'rgba(109, 40, 217, 0.18)',
    codeColor: '#C4B5FD',
    borderLeft: '#7C3AED',
    borderColor: 'rgba(109, 40, 217, 0.18)',
  },
  {
    key: 'plan' as const,
    code: 'P',
    label: 'PLAN',
    sublabel: 'Treatment, Medications & Follow-Up Orders',
    accentColor: '#FCD34D',
    bgColor: 'rgba(217, 119, 6, 0.07)',
    codeBg: 'rgba(217, 119, 6, 0.18)',
    codeColor: '#FCD34D',
    borderLeft: '#D97706',
    borderColor: 'rgba(217, 119, 6, 0.18)',
  },
];

function ShimmerBlock({ height = 'h-4', width = 'w-full' }: { height?: string; width?: string }) {
  return <div className={`${height} ${width} rounded shimmer`} />;
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function SOAPNotePanel({ note, status, patient, showHeader = true }: SOAPNotePanelProps) {
  const [copied, setCopied] = useState(false);
  const email = "wacotoc291@niprack.com";
  const [emailed, setIsEmailed] = useState(false)
  // const [translatedLang, setTranslatedLang] = useState('');

  const handleCopy = async () => {
    if (!note) return;
    const text = SECTIONS.map((s) => `${s.label}\n${note[s.key]}`).join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

const translateField = async (text: string): Promise<string> => {
  if (!patient?.preferred_language) return text;
  const resp = await fetch('http://localhost:8000/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target_lang: patient.preferred_language }),
  });
  const data = await resp.json();
  return data.translated;
};

const renderPage = (doc: jsPDF, fields: { label: string; content: string }[], isTranslated: boolean) => {
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Header ──
  doc.setFillColor(41, 98, 255);
  doc.rect(0, 0, pageWidth, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('SOAP Note', pageWidth / 2, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const pageLabel = isTranslated 
  ? `Translated to ${patient?.preferred_language ?? ''}` 
  : 'Original (English)';
  doc.text(pageLabel, pageWidth / 2, 29, { align: 'center' });

  // ── Sections ──
  let y = 50;
  doc.setTextColor(30, 30, 30);
  fields.forEach(({ label, content }) => {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(41, 98, 255);
    doc.text(label, 14, y);
    doc.setDrawColor(41, 98, 255);
    doc.setLineWidth(0.5);
    doc.line(14, y + 3, pageWidth - 14, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setCharSpace(0);
    doc.setTextColor(30, 30, 30);
    const split = doc.splitTextToSize(content || 'N/A', pageWidth - 28);
    doc.text(split, 14, y + 12);
    y += 12 + split.length * 7 + 10;
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
  });

  // ── Footer ──
  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 285);
};

  const generatePDF = async (output: 'preview' | 'base64' = 'preview') => {
  if (!note) return '';
  const doc = new jsPDF();

  const englishFields = SECTIONS.map(({ label, key }) => ({
    label,
    content: note[key] || 'N/A',
  }));

  // ── If language selected, translated page goes first ──
if (patient?.preferred_language) { // covers both null and undefined
  const translatedFields = await Promise.all(
    SECTIONS.map(async ({ label, key }) => ({
      label,
      content: await translateField(note[key] || ''),
    }))
  );
  renderPage(doc, translatedFields, true);
  doc.addPage();
}

  // ── English page ──
  renderPage(doc, englishFields, false);

  if (output === 'preview') {
    window.open(doc.output('bloburl'), '_blank');
    return '';
  }
  return doc.output('datauristring');
};

  const handleEmail = async () => {
    if (!note || !email) return;
    const pdfBase64 = await generatePDF('base64');
    const base64Content = pdfBase64.replace(/^data:.+;base64,/, '');
    await fetch('http://localhost:8000/api/send-appointment-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_email: email,
        pdf_base64: base64Content,
      }),
    });
    setIsEmailed(true);
    setTimeout(() => setIsEmailed(false), 2000);
  };

  

  return (
    <div className="flex flex-col h-full" style={{ background: '#060D1B' }}>

      {/* ── Panel header ── */}
      <div
      >
        {note && (
          <div className="flex items-center gap-3">
            {/* <select
              value={translatedLang}
              onChange={(e) => setTranslatedLang(e.target.value)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150"
              style={{ background: 'rgba(29,78,216,0.2)', color: '#93BBFF', border: '1px solid rgba(29,78,216,0.35)' }}
            >
                <option value="" disabled>Select Language</option>
                <option value="French">French</option>
                <option value="Spanish">Spanish</option>
                <option value="Italian">Italian</option>
            </select> */}
          </div>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Patient chart header (when note is present) ── */}
        {note && (
          <div
            className="mx-5 mt-5 rounded-xl overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.08)', background: '#0A1628' }}
          >
            {/* Chart title bar */}
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ background: 'rgba(29,78,216,0.1)', borderBottom: '1px solid rgba(29,78,216,0.18)' }}
            >
              <div className="flex items-center gap-3">
                <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: '#3B82F6' }}
              >
                Patient Chart — SOAP Documentation
              </span>
                        <button
            onClick={handleEmail} // was handleCopy, changed to generatePDF
            className="flex items-center gap-1 ml-auto text-[10px] font-semibold px-2 py-1 rounded tracking-wide"
          >
          </button>
              </div>
              
              <span className="text-[10px]" style={{ color: '#1E3A5A' }}>{todayStr()}</span>
            </div>

            {/* Patient info grid */}
            <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-2.5 px-4 py-3.5">
                <User className="w-3.5 h-3.5 shrink-0" style={{ color: '#2E4A66' }} />
                <div>
                  <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: '#1E3A5A' }}>Patient</div>
                  <div className="text-xs font-semibold" style={{ color: '#94A3B8' }}>
                    {patient ? `${patient.first_name} ${patient.last_name}` : 'Current Patient'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 px-4 py-3.5">
                <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: '#2E4A66' }} />
                <div>
                  <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: '#1E3A5A' }}>Date of Birth</div>
                  <div className="text-xs font-semibold" style={{ color: '#94A3B8' }}>
                    {patient?.dob ? formatDate(patient.dob) : '—'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 px-4 py-3.5">
                <Hash className="w-3.5 h-3.5 shrink-0" style={{ color: '#2E4A66' }} />
                <div>
                  <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: '#1E3A5A' }}>Health Number</div>
                  <div className="text-xs font-semibold mono-chip" style={{ color: '#94A3B8' }}>
                    {patient?.health_num ?? '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty / processing states ── */}
        {!note && status === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <FileText className="w-6 h-6" style={{ color: '#1E3A5A' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#2E4A66' }}>No note generated</p>
              <p className="text-xs mt-1" style={{ color: '#1A2E44' }}>Start a consultation to generate a SOAP note</p>
            </div>
          </div>
        )}

        {!note && status === 'recording' && (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <FileText className="w-6 h-6" style={{ color: '#1E3A5A' }} />
            </div>
            <p className="text-sm" style={{ color: '#2E4A66' }}>Note will appear after the consultation ends</p>
          </div>
        )}

        {!note && status === 'processing' && (
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#3B82F6' }} />
              <span className="text-sm font-medium" style={{ color: '#4A7FA8' }}>Generating SOAP note…</span>
            </div>
            {/* Skeleton chart header */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: '#0A1628' }}>
              <div className="h-8 shimmer" />
              <div className="grid grid-cols-3 gap-4 px-4 py-3">
                <ShimmerBlock height="h-8" />
                <ShimmerBlock height="h-8" />
                <ShimmerBlock height="h-8" />
              </div>
            </div>
            {SECTIONS.map((s) => (
              <div key={s.key} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="px-4 py-2.5 flex items-center gap-3" style={{ background: s.bgColor }}>
                  <div className="w-6 h-6 rounded shrink-0 shimmer" />
                  <ShimmerBlock height="h-3" width="w-32" />
                </div>
                <div className="px-4 py-3 space-y-2" style={{ background: '#0A1628' }}>
                  <ShimmerBlock height="h-3" />
                  <ShimmerBlock height="h-3" />
                  <ShimmerBlock height="h-3" width="w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SOAP sections ── */}
        {note && (
          <div className="px-5 pt-4 pb-6 space-y-1">
            {SECTIONS.map((s, idx) => {
              const conf = note.confidence_scores?.[s.key] ?? 1.0;
              const isLow = conf < 0.7;
              return (
                <div key={s.key}>
                  {/* Divider between sections */}
                  {idx > 0 && (
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.04)', margin: '0 0' }} />
                  )}
                  <div
                    className="note-section"
                    style={{
                      borderLeft: `3px solid ${isLow ? '#D97706' : s.borderLeft}`,
                      background: isLow ? 'rgba(217,119,6,0.04)' : s.bgColor,
                      paddingLeft: '16px',
                      paddingRight: '18px',
                      paddingTop: '16px',
                      paddingBottom: '16px',
                    }}
                  >
                    {/* Section label row */}
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="text-[11px] font-black rounded px-1.5 py-0.5"
                          style={{
                            background: isLow ? 'rgba(217,119,6,0.2)' : s.codeBg,
                            color: isLow ? '#FCD34D' : s.codeColor,
                            letterSpacing: '0.05em',
                            fontFamily: 'JetBrains Mono, monospace',
                          }}
                        >
                          {s.code}
                        </span>
                        <div>
                          <span
                            className="text-[10px] font-black uppercase tracking-widest"
                            style={{ color: isLow ? '#D97706' : s.accentColor }}
                          >
                            {s.label}
                          </span>
                          <span className="text-[9px] ml-2" style={{ color: '#1E3A5A' }}>
                            {s.sublabel}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isLow && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={
                            isLow
                              ? { background: 'rgba(217,119,6,0.15)', color: '#FCD34D', fontFamily: 'JetBrains Mono, monospace' }
                              : { background: 'rgba(16,185,129,0.1)', color: '#6EE7B7', fontFamily: 'JetBrains Mono, monospace' }
                          }
                        >
                          {Math.round(conf * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Section body */}
                    <p className="clinical-text" style={{ paddingLeft: '2px', paddingBottom: '2px' }}>
                      {note[s.key] || '—'}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* ── ICD-10 row ── */}
            {note.icd10_suggestions.length > 0 && (
              <div
                style={{
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  paddingTop: '16px',
                  paddingBottom: '6px',
                  marginTop: '10px',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#3B82F6', fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    ICD-10
                  </span>
                  <span className="text-[10px]" style={{ color: '#1E3A5A' }}>Diagnosis Codes</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {note.icd10_suggestions.map((code, i) => (
                    <span
                      key={i}
                      className="mono-chip text-xs px-2.5 py-1 rounded-lg font-bold"
                      style={{ background: 'rgba(29,78,216,0.14)', color: '#93BBFF', border: '1px solid rgba(29,78,216,0.28)' }}
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Documentation gaps ── */}
            {note.gaps.length > 0 && (
              <div
                className="rounded-xl mt-3 note-section"
                style={{ background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.18)', padding: '14px 16px' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#F59E0B' }}>
                    Documentation Gaps
                  </span>
                </div>
                <ul className="space-y-2">
                  {note.gaps.map((gap, i) => (
                    <li key={i} className="text-xs flex items-start gap-2" style={{ color: '#92660B' }}>
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
