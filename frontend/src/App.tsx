import { useState, useCallback, useRef, useEffect } from 'react';
import { FileText, Heart } from 'lucide-react';
import ControlBar from './components/ControlBar';
import TranscriptPanel from './components/TranscriptPanel';
import SOAPNotePanel from './components/SOAPNotePanel';
import PatientSummaryPanel from './components/PatientSummaryPanel';
import AuditPanel from './components/AuditPanel';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useSessionTimer } from './hooks/useSessionTimer';
import type { SessionStatus, TranscriptLine, SOAPNote, AuditResult, Patient } from './types';
import { supabase } from './supabase';

export interface AppProps {
    patient: Patient;
    mode: 'live' | 'demo' | null;
    onEndSession: () => void;
  }

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

  if (typeof window === 'undefined') {
    return 'ws://localhost/ws/realtime-transcript';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws/realtime-transcript`;
}


export default function App({ patient, mode, onEndSession }: AppProps) {
  const [status, setStatus]           = useState<SessionStatus>('idle');
  const [transcript, setTranscript]   = useState<TranscriptLine[]>([]);
  const [note, setNote]               = useState<SOAPNote | null>(null);
  const [audit, setAudit]             = useState<AuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [finalizingSession, setFinalizingSession] = useState(false);
  const [rightTab, setRightTab]       = useState<RightTab>('soap');

  const demoIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeWsRef = useRef<WebSocket | null>(null);
  const partialLineIdRef = useRef<string | null>(null);
  const commitToLineIdRef = useRef<Record<string, string>>({});
  const pendingSpeakerByCommitRef = useRef<Record<string, { speakerId?: string; confidence?: number }>>({});
  const seenCommitIdsRef = useRef<Set<string>>(new Set());
  const queuedAudioChunksRef = useRef<string[]>([]);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveStreamingRef = useRef<boolean>(false);
  const endingSessionRef = useRef<boolean>(false);
  const speakerIdToRoleRef = useRef<Record<string, 'Doctor' | 'Patient'>>({});
  const firstResolvedSpeakerIdRef = useRef<string | null>(null);
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
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
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

  const resolveSpeakerRole = useCallback((speakerId?: string | null) => {
    const id = (speakerId || '').trim();
    if (!id) return null;

    const existing = speakerIdToRoleRef.current[id];
    if (existing) return existing;

    if (!firstResolvedSpeakerIdRef.current) {
      firstResolvedSpeakerIdRef.current = id;
      speakerIdToRoleRef.current[id] = 'Doctor';
      return 'Doctor';
    }

    if (id === firstResolvedSpeakerIdRef.current) {
      speakerIdToRoleRef.current[id] = 'Doctor';
      return 'Doctor';
    }

    speakerIdToRoleRef.current[id] = 'Patient';
    return 'Patient';
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

      const speaker = existingPartial?.speaker || 'Analyzing speaker…';

      const partialLine: TranscriptLine = {
        id: partialId,
        speaker,
        text: trimmed,
        timestamp: Date.now() - recordingStartMsRef.current,
      };

      return [...stableLines, partialLine];
    });
  }, []);

  const commitLiveLine = useCallback((text: string, timestampMs?: number, speakerId?: string, commitId?: string) => {
    if (commitId) {
      if (seenCommitIdsRef.current.has(commitId)) return;
      seenCommitIdsRef.current.add(commitId);
    }

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
      const withoutPartial = prev.filter((line) => !line.id.startsWith('partial-'));

      const pendingReconcile = commitId ? pendingSpeakerByCommitRef.current[commitId] : undefined;
      const resolvedSpeakerId = pendingReconcile?.speakerId || speakerId;
      const resolvedSpeaker = resolveSpeakerRole(resolvedSpeakerId);
      const speaker = resolvedSpeaker || 'Pending speaker';

      const candidateTimestamp = typeof timestampMs === 'number'
        ? timestampMs
        : Date.now() - recordingStartMsRef.current;

      const hasNearbyDuplicate = withoutPartial
        .slice(-8)
        .some((line) => {
          const normalizedLine = normalizeTranscriptText(line.text);
          const textMatches = (
            normalizedLine === normalizedIncoming
            || normalizedLine.startsWith(normalizedIncoming)
            || normalizedIncoming.startsWith(normalizedLine)
          );
          const nearInTime = Math.abs(line.timestamp - candidateTimestamp) < 3000;
          return textMatches && nearInTime;
        });

      if (hasNearbyDuplicate) {
        partialLineIdRef.current = null;
        return withoutPartial;
      }

      partialLineIdRef.current = null;
      didAppend = true;

      const lineId = `${Date.now()}-${Math.random()}`;
      if (commitId) {
        commitToLineIdRef.current[commitId] = lineId;
        if (pendingReconcile) {
          delete pendingSpeakerByCommitRef.current[commitId];
        }
      }

      return [
        ...withoutPartial,
        {
          id: lineId,
          speaker,
          speakerId: resolvedSpeakerId || undefined,
          text: trimmed,
          timestamp: candidateTimestamp,
        },
      ];
    });

    if (didAppend) {
      lastCommittedRef.current = { text: normalizedIncoming, atMs: now };
    }
  }, [resolveSpeakerRole]);

  const reconcileSessionSpeakers = useCallback(async (blob: Blob, lines: TranscriptLine[]): Promise<TranscriptLine[]> => {
    const committedLines = lines.filter((line) => !line.id.startsWith('partial-'));
    if (!committedLines.length) return committedLines;

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    const b64 = await blobToBase64(blob);
    const payload = {
      audio_base64: b64,
      filename: 'audio.webm',
      segments: committedLines.map((line) => ({
        text: line.text,
        timestamp_ms: line.timestamp,
      })),
    };

    const res = await fetch(`${API}/reconcile-speakers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Speaker reconciliation failed: ${res.statusText}`);
    }

    const body = await res.json() as {
      segments?: Array<{
        text: string;
        timestamp_ms: number;
        speaker_id: string;
        confidence?: number;
      }>;
    };

    const reconciledSegments = Array.isArray(body.segments) ? body.segments : [];
    if (!reconciledSegments.length) return committedLines;

    return committedLines.map((line, index) => {
      const reconciled = reconciledSegments[index];
      if (!reconciled) return line;
      const speaker = resolveSpeakerRole(reconciled.speaker_id) || line.speaker;
      return {
        ...line,
        speakerId: reconciled.speaker_id,
        speaker,
      };
    });
  }, [resolveSpeakerRole]);

  const waitForLiveCommitDrain = useCallback(async () => {
    let lastCount = transcriptRef.current.filter((line) => !line.id.startsWith('partial-')).length;
    let stableRounds = 0;

    for (let i = 0; i < 16; i++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const currentCount = transcriptRef.current.filter((line) => !line.id.startsWith('partial-')).length;
      if (currentCount === lastCount) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
        lastCount = currentCount;
      }

      if (stableRounds >= 3) break;
    }
  }, []);

  const flushQueuedAudioChunks = useCallback(() => {
    const ws = realtimeWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    while (queuedAudioChunksRef.current.length > 0) {
      const chunk = queuedAudioChunksRef.current.shift();
      if (!chunk) continue;
      ws.send(JSON.stringify({
        type: 'audio_chunk',
        audio_base64: chunk,
      }));
    }
  }, []);

  const reconcileCommittedSpeaker = useCallback((commitId: string, speakerId?: string) => {
    const lineId = commitToLineIdRef.current[commitId];
    const speaker = resolveSpeakerRole(speakerId);
    if (!speaker) return;

    if (!lineId) {
      pendingSpeakerByCommitRef.current[commitId] = { speakerId };
      return;
    }

    setTranscript((prev) => prev.map((line) => (
      line.id === lineId ? { ...line, speaker, speakerId } : line
    )));
  }, [resolveSpeakerRole]);

  const connectRealtimeTranscriptSocket = useCallback(async () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (realtimeWsRef.current && realtimeWsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    if (realtimeWsRef.current) {
      realtimeWsRef.current.close();
      realtimeWsRef.current = null;
    }

    const wsUrl = getRealtimeWsUrl();

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      realtimeWsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        flushQueuedAudioChunks();
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            commit_id?: string;
            speaker_id?: string;
            text?: string;
            timestamp_ms?: number;
            confidence?: number;
            message?: string;
          };

          if (msg.type === 'partial' && msg.text) {
            upsertPartialLine(msg.text);
          } else if (msg.type === 'committed' && msg.text) {
            commitLiveLine(msg.text, msg.timestamp_ms, msg.speaker_id, msg.commit_id);
          } else if (msg.type === 'speaker_reconciled' && msg.commit_id) {
            reconcileCommittedSpeaker(msg.commit_id, msg.speaker_id);
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

        if (!liveStreamingRef.current || endingSessionRef.current) return;

        const nextAttempt = reconnectAttemptsRef.current + 1;
        reconnectAttemptsRef.current = nextAttempt;
        const backoffMs = Math.min(3000, 400 * (2 ** Math.min(nextAttempt, 4)));

        reconnectTimerRef.current = setTimeout(() => {
          connectRealtimeTranscriptSocket().catch(() => {
            setError('Realtime connection interrupted; retrying…');
          });
        }, backoffMs);
      };
    });
  }, [commitLiveLine, flushQueuedAudioChunks, reconcileCommittedSpeaker, upsertPartialLine]);

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
            body: JSON.stringify({ transcript: fullText, patient_id: patient.id }),
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
    commitToLineIdRef.current = {};
    pendingSpeakerByCommitRef.current = {};
    seenCommitIdsRef.current = new Set();
    queuedAudioChunksRef.current = [];
    reconnectAttemptsRef.current = 0;
    endingSessionRef.current = false;
    liveStreamingRef.current = true;
    speakerIdToRoleRef.current = {};
    firstResolvedSpeakerIdRef.current = null;
    lastCommittedRef.current = null;
    recordingStartMsRef.current = Date.now();

    await connectRealtimeTranscriptSocket();

    await startRecording({
      onChunk: async (chunk) => {
        queuedAudioChunksRef.current.push(chunk.base64);
        if (queuedAudioChunksRef.current.length > 500) {
          queuedAudioChunksRef.current.shift();
        }

        flushQueuedAudioChunks();

        if (!realtimeWsRef.current || realtimeWsRef.current.readyState !== WebSocket.OPEN) {
          connectRealtimeTranscriptSocket().catch(() => undefined);
        }
      },
    });


    setStatus('recording');
    timer.start();
  }, [connectRealtimeTranscriptSocket, flushQueuedAudioChunks, startRecording, timer]);

  const endSession = useCallback(async () => {
    setStatus('processing');
    setFinalizingSession(true);
    try {
      timer.stop();
      endingSessionRef.current = true;
      liveStreamingRef.current = false;

      if (isRecording) {
        const blob = await stopRecording();

        flushQueuedAudioChunks();

        if (realtimeWsRef.current && realtimeWsRef.current.readyState === WebSocket.OPEN) {
          realtimeWsRef.current.send(JSON.stringify({ type: 'commit' }));
        }

        await waitForLiveCommitDrain();

        if (realtimeWsRef.current && realtimeWsRef.current.readyState === WebSocket.OPEN) {
          realtimeWsRef.current.send(JSON.stringify({ type: 'stop' }));
        }

        await new Promise((resolve) => setTimeout(resolve, 300));

        if (realtimeWsRef.current) {
          realtimeWsRef.current.close();
          realtimeWsRef.current = null;
        }

        const liveLines = transcriptRef.current.filter((line) => !line.id.startsWith('partial-'));

        if (blob) {
          if (liveLines.length > 0) {
            try {
              const reconciledLines = await reconcileSessionSpeakers(blob, liveLines);
              setTranscript(reconciledLines);
              await generateNoteFromTranscript(reconciledLines);
            } catch (err) {
              console.error(err);
              setError(err instanceof Error ? err.message : 'Speaker reconciliation failed');
              setTranscript(liveLines);
              setStatus('done');
            }
          } else {
            setError('No live transcript captured from ElevenLabs. Please retry the recording.');
            setStatus('done');
          }
        }
      } else {
        await generateNoteFromTranscript(transcript);
      }
    } finally {
      setFinalizingSession(false);
    }
  }, [
    flushQueuedAudioChunks,
    generateNoteFromTranscript,
    isRecording,
    reconcileSessionSpeakers,
    stopRecording,
    timer,
    transcript,
    waitForLiveCommitDrain,
  ]);

  const reset = useCallback(() => {
    console.log('reset called');
    if (demoIntervalRef.current) clearTimeout(demoIntervalRef.current);
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (realtimeWsRef.current) {
      realtimeWsRef.current.close();
      realtimeWsRef.current = null;
    }
    partialLineIdRef.current = null;
    commitToLineIdRef.current = {};
    pendingSpeakerByCommitRef.current = {};
    seenCommitIdsRef.current = new Set();
    queuedAudioChunksRef.current = [];
    reconnectAttemptsRef.current = 0;
    endingSessionRef.current = false;
    liveStreamingRef.current = false;
    speakerIdToRoleRef.current = {};
    firstResolvedSpeakerIdRef.current = null;
    lastCommittedRef.current = null;
    setStatus('idle');
    setTranscript([]);
    setNote(null);
    setAudit(null);
    setFinalizingSession(false);
    setError(null);
    setRightTab('soap');
    timer.reset();
    console.log('calling onEndSession');
    onEndSession();
    console.log('onEndSession called');
  }, [timer, onEndSession]);

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
        onEndSession={reset}
        patient={patient}
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

      {finalizingSession && (
        <div
          className="px-5 py-2 text-xs font-semibold flex items-center gap-2"
          style={{
            background: 'rgba(59,130,246,0.08)',
            borderBottom: '1px solid rgba(59,130,246,0.2)',
            color: '#93BBFF',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
          Finalizing speaker attribution and clinical note…
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
              <Heart className="w-3.5 h-3.5" />
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
