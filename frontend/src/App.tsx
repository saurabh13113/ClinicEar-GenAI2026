import { useState, useCallback, useRef, useEffect } from 'react';
import { FileText, FileHeart } from 'lucide-react';
import ControlBar from './components/ControlBar';
import TranscriptPanel from './components/TranscriptPanel';
import SOAPNotePanel from './components/SOAPNotePanel';
import PatientSummaryPanel from './components/PatientSummaryPanel';
import AuditPanel from './components/AuditPanel';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useSessionTimer } from './hooks/useSessionTimer';
import type { SessionStatus, TranscriptLine, SOAPNote, AuditResult } from './types';
import { supabase } from './supabase';


const API = import.meta.env.VITE_API_URL || '/api';

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
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}


type RightTab = 'soap' | 'patient';

function normalizeTranscriptText(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
}

function normalizeAuditResult(payload: unknown): AuditResult | null {
  if (!payload || typeof payload !== 'object') return null;

  const data = payload as Record<string, unknown>;
  const quality = Number(data.quality_score);
  const completeness = Number(data.completeness_score);

  if (!Number.isFinite(quality) || !Number.isFinite(completeness)) {
    return null;
  }

  return {
    quality_score: Math.max(0, Math.min(100, Math.round(quality))),
    completeness_score: Math.max(0, Math.min(100, Math.round(completeness))),
    flagged_terms: Array.isArray(data.flagged_terms)
      ? data.flagged_terms.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : [],
    consistency_notes: typeof data.consistency_notes === 'string' ? data.consistency_notes : '',
  };
}

function getRealtimeWsUrl() {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;

  if (apiUrl && /^https?:\/\//.test(apiUrl)) {
    const wsBase = apiUrl.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
    return `${wsBase}/ws/realtime-transcript`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws/realtime-transcript`;
}


export default function App() {
  const [status, setStatus]           = useState<SessionStatus>('idle');
  const [transcript, setTranscript]   = useState<TranscriptLine[]>([]);
  const [note, setNote]               = useState<SOAPNote | null>(null);
  const [audit, setAudit]             = useState<AuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [rightTab, setRightTab]       = useState<RightTab>('soap');

  const demoIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeWsRef = useRef<WebSocket | null>(null);
  const partialLineIdRef = useRef<string | null>(null);
  const recordingStartMsRef = useRef<number>(0);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const lastCommittedRef = useRef<{ text: string; atMs: number } | null>(null);

  const { isRecording, startRecording, stopRecording } = useAudioRecorder();
  const timer = useSessionTimer();

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    return () => {
      if (realtimeWsRef.current) {
        realtimeWsRef.current.close();
        realtimeWsRef.current = null;
      }
    };
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const addLine = useCallback((line: Omit<TranscriptLine, 'id'>) => {
    setTranscript((prev) => [...prev, { ...line, id: `${Date.now()}-${Math.random()}` }]);
  }, []);

  const getNextSpeaker = useCallback((lines: TranscriptLine[]): 'Doctor' | 'Patient' => {
    const lastFinal = [...lines].reverse().find((line) => !line.id.startsWith('partial-'));
    if (!lastFinal) return 'Doctor';
    return lastFinal.speaker === 'Doctor' ? 'Patient' : 'Doctor';
  }, []);

  const upsertPartialLine = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const normalizedIncoming = normalizeTranscriptText(trimmed);
    if (!normalizedIncoming) return;

    setTranscript((prev) => {
      const lastFinalLine = [...prev].reverse().find((line) => !line.id.startsWith('partial-'));
      if (lastFinalLine) {
        const normalizedLastFinal = normalizeTranscriptText(lastFinalLine.text);
        if (
          normalizedIncoming === normalizedLastFinal ||
          normalizedIncoming.startsWith(normalizedLastFinal) ||
          normalizedLastFinal.startsWith(normalizedIncoming)
        ) {
          return prev;
        }
      }

      const lastCommitted = lastCommittedRef.current;
      if (lastCommitted) {
        const normalizedLastCommitted = normalizeTranscriptText(lastCommitted.text);
        const isNearInTime = Date.now() - lastCommitted.atMs < 8000;
        if (
          isNearInTime && (
            normalizedIncoming === normalizedLastCommitted ||
            normalizedIncoming.startsWith(normalizedLastCommitted) ||
            normalizedLastCommitted.startsWith(normalizedIncoming)
          )
        ) {
          return prev;
        }
      }

      const existingId = partialLineIdRef.current;
      const existingPartial = existingId ? prev.find((line) => line.id === existingId) : undefined;

      const stableLines = prev.filter((line) => !line.id.startsWith('partial-'));
      const partialId = existingId || `partial-${Date.now()}-${Math.random()}`;
      partialLineIdRef.current = partialId;

      const speaker = existingPartial?.speaker === 'Doctor' || existingPartial?.speaker === 'Patient'
        ? existingPartial.speaker
        : getNextSpeaker(stableLines);

      const partialLine: TranscriptLine = {
        id: partialId,
        speaker,
        text: trimmed,
        timestamp: Date.now() - recordingStartMsRef.current,
      };

      return [...stableLines, partialLine];
    });
  }, [getNextSpeaker]);

  const commitLiveLine = useCallback((text: string, timestampMs?: number) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const normalizedIncoming = normalizeTranscriptText(trimmed);
    if (!normalizedIncoming) return;
    const now = Date.now();
    const lastCommitted = lastCommittedRef.current;

    if (lastCommitted && lastCommitted.text === normalizedIncoming && now - lastCommitted.atMs < 4000) {
      setTranscript((prev) => {
        const withoutPartial = prev.filter((line) => !line.id.startsWith('partial-'));
        partialLineIdRef.current = null;
        return withoutPartial;
      });
      return;
    }

    let didAppend = false;

    setTranscript((prev) => {
      const existingPartial = partialLineIdRef.current
        ? prev.find((line) => line.id === partialLineIdRef.current)
        : undefined;

      const withoutPartial = prev.filter((line) => !line.id.startsWith('partial-'));

      const speaker = existingPartial?.speaker === 'Doctor' || existingPartial?.speaker === 'Patient'
        ? existingPartial.speaker
        : getNextSpeaker(withoutPartial);

      const lastFinalLine = [...withoutPartial].reverse().find((line) => !line.id.startsWith('partial-'));
      if (lastFinalLine) {
        const normalizedLast = normalizeTranscriptText(lastFinalLine.text);
        if (normalizedLast === normalizedIncoming) {
          partialLineIdRef.current = null;
          return withoutPartial;
        }
      }

      partialLineIdRef.current = null;
      didAppend = true;

      return [
        ...withoutPartial,
        {
          id: `${Date.now()}-${Math.random()}`,
          speaker,
          text: trimmed,
          timestamp: typeof timestampMs === 'number' ? timestampMs : Date.now() - recordingStartMsRef.current,
        },
      ];
    });

    if (didAppend) {
      lastCommittedRef.current = { text: normalizedIncoming, atMs: now };
    }
  }, [getNextSpeaker]);

  const connectRealtimeTranscriptSocket = useCallback(async () => {
    if (realtimeWsRef.current) {
      realtimeWsRef.current.close();
      realtimeWsRef.current = null;
    }

    const wsUrl = getRealtimeWsUrl();

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      realtimeWsRef.current = ws;

      ws.onopen = () => resolve();

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            text?: string;
            timestamp_ms?: number;
            message?: string;
          };

          if (msg.type === 'partial' && msg.text) {
            upsertPartialLine(msg.text);
          } else if (msg.type === 'committed' && msg.text) {
            commitLiveLine(msg.text, msg.timestamp_ms);
          } else if (msg.type === 'error') {
            setError(msg.message || 'Realtime transcription failed');
          }
        } catch {
          // Ignore malformed websocket messages
        }
      };

      ws.onerror = () => reject(new Error('Could not connect to realtime transcription service'));
      ws.onclose = () => {
        if (realtimeWsRef.current === ws) realtimeWsRef.current = null;
      };
    });
  }, [commitLiveLine, upsertPartialLine]);

  const generateNoteFromTranscript = useCallback(async (lines: TranscriptLine[]) => {
    setStatus('processing');
    const fullText = lines.map((l) => `${l.speaker}: ${l.text}`).join('\n');

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    try {
        const res = await fetch(`${API}/generate-note`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
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

      fetch(`${API}/audit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ soap_note: noteText }),
      })
        .then(async (r) => {
          const payload = await r.json().catch(() => ({}));
          if (!r.ok) {
            const detail = typeof payload?.detail === 'string' ? payload.detail : `status ${r.status}`;
            throw new Error(`Audit failed (${detail})`);
          }

          const normalized = normalizeAuditResult(payload);
          if (!normalized) {
            throw new Error('Audit returned invalid payload');
          }

          setAudit(normalized);
        })
        .catch((err) => {
          console.error(err);
          setError(err instanceof Error ? err.message : 'Audit failed');
          setAudit(null);
        })
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
    setRightTab('soap');
    timer.start();

    let i = 0;
    const scheduleNext = () => {
      if (i >= DEMO_TRANSCRIPT_LINES.length) {
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

    setRightTab('soap');

    partialLineIdRef.current = null;
    lastCommittedRef.current = null;
    recordingStartMsRef.current = Date.now();

    await connectRealtimeTranscriptSocket();

    await startRecording({
      onChunk: async (chunk) => {
        if (!realtimeWsRef.current || realtimeWsRef.current.readyState !== WebSocket.OPEN) return;
        realtimeWsRef.current.send(JSON.stringify({
          type: 'audio_chunk',
          audio_base64: chunk.base64,
        }));
      },
    });


    setStatus('recording');
    timer.start();
  }, [connectRealtimeTranscriptSocket, startRecording, timer]);

  const endSession = useCallback(async () => {
    timer.stop();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (isRecording) {
      const blob = await stopRecording();

      if (realtimeWsRef.current && realtimeWsRef.current.readyState === WebSocket.OPEN) {
        realtimeWsRef.current.send(JSON.stringify({ type: 'commit' }));
        realtimeWsRef.current.send(JSON.stringify({ type: 'stop' }));
      }

      await new Promise((resolve) => setTimeout(resolve, 900));

      if (realtimeWsRef.current) {
        realtimeWsRef.current.close();
        realtimeWsRef.current = null;
      }

      const liveLines = transcriptRef.current.filter((line) => !line.id.startsWith('partial-'));

      if (blob) {
        if (liveLines.length > 0) {
          setTranscript(liveLines);
          await generateNoteFromTranscript(liveLines);
        } else {
          setStatus('processing');
          try {
            const b64 = await blobToBase64(blob);
            const res = await fetch(`${API}/transcribe`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
              body: JSON.stringify({ audio_base64: b64, filename: 'audio.webm' }),
            });

            if (!res.ok) throw new Error('Transcription failed');
            const { transcript: raw }: { transcript: string } = await res.json();

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
      }
    } else {
      await generateNoteFromTranscript(transcript);
    }
  }, [isRecording, stopRecording, transcript, generateNoteFromTranscript, timer]);

  const reset = useCallback(() => {
    if (demoIntervalRef.current) clearTimeout(demoIntervalRef.current);
    if (realtimeWsRef.current) {
      realtimeWsRef.current.close();
      realtimeWsRef.current = null;
    }
    partialLineIdRef.current = null;
    lastCommittedRef.current = null;
    setStatus('idle');
    setTranscript([]);
    setNote(null);
    setAudit(null);
    setError(null);
    setRightTab('soap');
    timer.reset();
  }, [timer]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen" style={{ background: '#050C1A', fontFamily: 'Sora, sans-serif' }}>
      <ControlBar
        status={status}
        timerFormatted={timer.formatted}
        turnCount={transcript.length}
        onStartLive={startLive}
        onStartDemo={startDemo}
        onEnd={endSession}
        onReset={reset}
      />

      {/* Error banner */}
      {error && (
        <div
          className="px-5 py-2 text-xs font-semibold flex items-center gap-2"
          style={{
            background: 'rgba(239,68,68,0.08)',
            borderBottom: '1px solid rgba(239,68,68,0.2)',
            color: '#FCA5A5',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          {error}
        </div>
      )}

      {/* Main panels */}
      <div
        className="flex flex-1 overflow-hidden"
        style={{ gap: '1px', background: 'rgba(255,255,255,0.04)' }}
      >
        {/* Left: Transcript */}
        <div className="w-[44%] flex flex-col overflow-hidden">
          <TranscriptPanel lines={transcript} status={status} />
        </div>

        {/* Right: Tab panel + Audit */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Tab bar */}
          <div
            className="shrink-0 flex items-center gap-1 px-4"
            style={{
              background: '#0A1628',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              height: '44px',
            }}
          >
            <button
              onClick={() => setRightTab('soap')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
              style={
                rightTab === 'soap'
                  ? { background: 'rgba(29,78,216,0.14)', color: '#93BBFF', border: '1px solid rgba(29,78,216,0.28)' }
                  : { background: 'transparent', color: '#2E4A66', border: '1px solid transparent' }
              }
            >
              <FileText className="w-3.5 h-3.5" />
              Clinical Note
            </button>

            <button
              onClick={() => setRightTab('patient')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
              style={
                rightTab === 'patient'
                  ? { background: 'rgba(244,114,182,0.1)', color: '#F9A8D4', border: '1px solid rgba(244,114,182,0.22)' }
                  : { background: 'transparent', color: '#2E4A66', border: '1px solid transparent' }
              }
            >
              <FileHeart className="w-3.5 h-3.5" />
              Patient Summary
            </button>

            {/* Note ready indicator */}
            {note && (
              <span
                className="ml-auto text-[10px] font-semibold px-2 py-1 rounded-full"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.18)' }}
              >
                Note ready
              </span>
            )}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            {rightTab === 'soap' ? (
              <SOAPNotePanel note={note} status={status} />
            ) : (
              <PatientSummaryPanel note={note} status={status} />
            )}
          </div>

          {/* Audit strip — always visible */}
          <AuditPanel audit={audit} isLoading={auditLoading} />
        </div>
      </div>
    </div>
  );
}
