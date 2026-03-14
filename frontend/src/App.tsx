import { useState, useCallback, useRef } from 'react';
import ControlBar from './components/ControlBar';
import TranscriptPanel from './components/TranscriptPanel';
import SOAPNotePanel from './components/SOAPNotePanel';
import AuditPanel from './components/AuditPanel';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useSessionTimer } from './hooks/useSessionTimer';
import type { SessionStatus, TranscriptLine, SOAPNote, AuditResult } from './types';

// Synthetic demo consultation transcript
const DEMO_TRANSCRIPT_LINES: Omit<TranscriptLine, 'id'>[] = [
  { speaker: 'Doctor',  text: "Good morning, Mr. Thompson. What brings you in today?", timestamp: 0 },
  { speaker: 'Patient', text: "Morning, doc. I've been having this chest tightness for about a week now, especially in the mornings. And I've been pretty short of breath climbing stairs.", timestamp: 4000 },
  { speaker: 'Doctor',  text: "I see. Any coughing, fever, or leg swelling?", timestamp: 9000 },
  { speaker: 'Patient', text: "Some coughing at night, yeah. No fever. My ankles do look a little puffy by evening.", timestamp: 13000 },
  { speaker: 'Doctor',  text: "How long have you had the ankle swelling?", timestamp: 18000 },
  { speaker: 'Patient', text: "Maybe two, three weeks? I thought it was just the heat.", timestamp: 21000 },
  { speaker: 'Doctor',  text: "Are you on any medications currently?", timestamp: 25000 },
  { speaker: 'Patient', text: "Atorvastatin for cholesterol, and lisinopril. Been on those about two years.", timestamp: 28000 },
  { speaker: 'Doctor',  text: "Your BP is 148 over 92 today, pulse 88, O2 sat 94% on room air. I'm hearing some bibasilar crackles on auscultation.", timestamp: 34000 },
  { speaker: 'Doctor',  text: "Based on the presentation — the dyspnea on exertion, ankle oedema, orthopnea, and the crackles — I'm concerned we're looking at early decompensated heart failure. I'd like to order a BNP, chest X-ray, and an echocardiogram.", timestamp: 42000 },
  { speaker: 'Patient', text: "Heart failure? That sounds serious.", timestamp: 52000 },
  { speaker: 'Doctor',  text: "We caught it early. We'll adjust your lisinopril dose and add a diuretic — furosemide 40mg daily. I want you to restrict salt to under 2 grams per day and weigh yourself every morning. Come back in two weeks, or go to the ER if the breathlessness gets worse.", timestamp: 56000 },
];

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data:...;base64,
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function App() {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [note, setNote] = useState<SOAPNote | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const demoIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isRecording, startRecording, stopRecording } = useAudioRecorder();
  const timer = useSessionTimer();

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const addLine = useCallback((line: Omit<TranscriptLine, 'id'>) => {
    setTranscript((prev) => [...prev, { ...line, id: `${Date.now()}-${Math.random()}` }]);
  }, []);

  const generateNoteFromTranscript = useCallback(async (lines: TranscriptLine[]) => {
    setStatus('processing');
    const fullText = lines
      .map((l) => `${l.speaker}: ${l.text}`)
      .join('\n');

    try {
      const res = await fetch('/api/generate-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: fullText }),
      });

      if (!res.ok) throw new Error(`Note generation failed: ${res.statusText}`);
      const soapNote: SOAPNote = await res.json();
      setNote(soapNote);
      setStatus('done');

      // Kick off IBM audit in background
      setAuditLoading(true);
      const sections = ['S — Subjective', 'O — Objective', 'A — Assessment', 'P — Plan'];
      const noteText = [soapNote.subjective, soapNote.objective, soapNote.assessment, soapNote.plan]
        .map((t, i) => `${sections[i]}\n${t}`)
        .join('\n\n');

      fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soap_note: noteText }),
      })
        .then((r) => r.json())
        .then((a: AuditResult) => setAudit(a))
        .catch(console.error)
        .finally(() => setAuditLoading(false));

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('done');
    }
  }, []);

  // ── Demo mode ─────────────────────────────────────────────────────────────────

  const startDemo = useCallback(() => {
    setStatus('recording');
    setTranscript([]);
    setNote(null);
    setAudit(null);
    setError(null);
    timer.start();

    let i = 0;
    const scheduleNext = () => {
      if (i >= DEMO_TRANSCRIPT_LINES.length) {
        // Auto-end after last line
        setTimeout(() => {
          timer.stop();
          generateNoteFromTranscript(
            DEMO_TRANSCRIPT_LINES.map((l, idx) => ({ ...l, id: String(idx) }))
          );
        }, 1500);
        return;
      }

      const line = DEMO_TRANSCRIPT_LINES[i];
      const nextLine = DEMO_TRANSCRIPT_LINES[i + 1];
      const delay = nextLine ? nextLine.timestamp - line.timestamp : 2000;

      addLine(line);
      i++;
      demoIntervalRef.current = setTimeout(scheduleNext, delay);
    };

    scheduleNext();
  }, [addLine, generateNoteFromTranscript, timer]);

  // ── Live mic ──────────────────────────────────────────────────────────────────

  const startLive = useCallback(async () => {
    setTranscript([]);
    setNote(null);
    setAudit(null);
    setError(null);

    await startRecording();
    setStatus('recording');
    timer.start();
  }, [startRecording, timer]);

  const endSession = useCallback(async () => {
    timer.stop();

    if (isRecording) {
      const blob = await stopRecording();
      if (blob) {
        setStatus('processing');
        try {
          const b64 = await blobToBase64(blob);
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_base64: b64, filename: 'audio.webm' }),
          });

          if (!res.ok) throw new Error('Transcription failed');
          const { transcript: raw }: { transcript: string } = await res.json();

          // Split into lines (basic heuristic — no real diarization for MVP)
          const lines: TranscriptLine[] = raw
            .split(/[.!?]+/)
            .filter((s) => s.trim().length > 0)
            .map((s, idx) => ({
              id: String(idx),
              speaker: idx % 2 === 0 ? 'Doctor' : 'Patient',
              text: s.trim(),
              timestamp: idx * 3000,
            }));

          setTranscript(lines);
          await generateNoteFromTranscript(lines);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Transcription error');
          setStatus('done');
        }
      }
    } else {
      // Demo mode — use existing transcript
      await generateNoteFromTranscript(transcript);
    }
  }, [isRecording, stopRecording, transcript, generateNoteFromTranscript, timer]);

  const reset = useCallback(() => {
    if (demoIntervalRef.current) clearTimeout(demoIntervalRef.current);
    setStatus('idle');
    setTranscript([]);
    setNote(null);
    setAudit(null);
    setError(null);
    timer.reset();
  }, [timer]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      <ControlBar
        status={status}
        timerFormatted={timer.formatted}
        onStartLive={startLive}
        onStartDemo={startDemo}
        onEnd={endSession}
        onReset={reset}
      />

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700">
          Error: {error}
        </div>
      )}

      {/* Main panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Transcript */}
        <div className="w-[45%] flex flex-col overflow-hidden">
          <TranscriptPanel lines={transcript} status={status} />
        </div>

        {/* Right: SOAP Note + Audit */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <SOAPNotePanel note={note} status={status} />
          </div>
          <AuditPanel audit={audit} isLoading={auditLoading} />
        </div>
      </div>
    </div>
  );
}
