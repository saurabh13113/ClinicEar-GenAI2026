import os
import json
import base64
import asyncio
import io
import re
import uuid
import wave
from pathlib import Path
from urllib.parse import urlencode
from urllib.parse import urlparse

from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from supabase import create_client
from pydantic import BaseModel
from dotenv import load_dotenv
import openai
import httpx
import websockets
from websockets.exceptions import ConnectionClosed

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

app = FastAPI(title="ClinicalEar API")

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:5174,http://localhost:3000,"
    "https://frontend-delta-ochre-79.vercel.app",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SOAP note generation + audit — free hackathon GPT-OSS 120B server
# Fallback: set OPENROUTER_API_KEY to use OpenRouter instead
_use_openrouter = bool(os.getenv("OPENROUTER_API_KEY"))
INFERENCE_MODEL = os.getenv("INFERENCE_MODEL", "openai/gpt-oss-120b")
openrouter_client = openai.OpenAI(
    base_url=(
        "https://openrouter.ai/api/v1"
        if _use_openrouter
        else "https://vjioo4r1vyvcozuj.us-east-2.aws.endpoints.huggingface.cloud/v1"
    ),
    api_key=os.getenv("OPENROUTER_API_KEY", "test"),
)

security = HTTPBearer()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))


# ── Request / Response models ──────────────────────────────────────────────────

class GenerateNoteRequest(BaseModel):
    transcript: str


class SOAPNote(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str
    icd10_suggestions: list[str]
    confidence_scores: dict[str, float]
    gaps: list[str]


class AuditRequest(BaseModel):
    soap_note: str


class AuditResponse(BaseModel):
    quality_score: int
    flagged_terms: list[str]
    completeness_score: int
    consistency_notes: str


class ReconcileSegment(BaseModel):
    text: str
    timestamp_ms: int


class ReconcileSpeakersRequest(BaseModel):
    audio_base64: str
    filename: str = "audio.webm"
    segments: list[ReconcileSegment]


class ReconcileSpeakersResult(BaseModel):
    text: str
    timestamp_ms: int
    speaker_id: str
    confidence: float


class ReconcileSpeakersResponse(BaseModel):
    segments: list[ReconcileSpeakersResult]


# ── Helpers ────────────────────────────────────────────────────────────────────

def extract_text(response) -> str:
    """Extract text from a chat completion, falling back to reasoning field."""
    msg = response.choices[0].message
    text = msg.content or getattr(msg, "reasoning", None) or ""
    return text.strip()


def strip_fences(raw: str) -> str:
    """Remove markdown code fences from a string."""
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return raw.strip()


def parse_first_json_object(raw: str, preferred_keys: set[str] | None = None) -> dict:
    candidate = strip_fences(raw)
    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            if not preferred_keys or preferred_keys.intersection(set(parsed.keys())):
                return parsed
            # keep searching if parsed object doesn't look like the expected schema
            pass
        else:
            parsed = None
    except Exception:
        parsed = None

    candidates: list[dict] = []
    if isinstance(parsed, dict):
        candidates.append(parsed)

    text = raw or ""
    start = text.find("{")
    while start != -1:
        depth = 0
        in_string = False
        escape = False
        for idx in range(start, len(text)):
            char = text[idx]

            if escape:
                escape = False
                continue

            if char == "\\":
                escape = True
                continue

            if char == '"':
                in_string = not in_string
                continue

            if in_string:
                continue

            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    snippet = text[start:idx + 1]
                    try:
                        parsed_snippet = json.loads(snippet)
                        if isinstance(parsed_snippet, dict):
                            candidates.append(parsed_snippet)
                    except Exception:
                        pass
                    break

        start = text.find("{", start + 1)

    if not candidates:
        raise ValueError("Model returned no parseable JSON object")

    if preferred_keys:
        def score(item: dict) -> int:
            return len(preferred_keys.intersection(set(item.keys())))

        best = max(candidates, key=score)
        if score(best) > 0:
            return best

    return candidates[0]


def _is_valid_url(value: str | None) -> bool:
    if not value:
        return False
    parsed = urlparse(value.strip())
    return bool(parsed.scheme and parsed.netloc)


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _normalize_for_match(text: str) -> str:
    cleaned = (text or "").strip().lower()
    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _token_set(text: str) -> set[str]:
    return {token for token in _normalize_for_match(text).split(" ") if token}


def _pcm16le_to_wav_bytes(pcm_bytes: bytes, sample_rate: int = 16000, channels: int = 1) -> bytes:
    with io.BytesIO() as buffer:
        with wave.open(buffer, "wb") as wav_file:
            wav_file.setnchannels(channels)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm_bytes)
        return buffer.getvalue()


def _segment_words_by_speaker(words: list[dict]) -> list[dict]:
    segments: list[dict] = []
    current: dict | None = None

    for word in words:
        if word.get("type") != "word":
            continue
        text = str(word.get("text", "")).strip()
        if not text:
            continue

        speaker_id = str(word.get("speaker_id") or "unknown")
        start = float(word.get("start") or 0.0)
        end = float(word.get("end") or start)

        if current and current["speaker_id"] == speaker_id:
            current["tokens"].append(text)
            current["end"] = end
        else:
            current = {
                "speaker_id": speaker_id,
                "start": start,
                "end": end,
                "tokens": [text],
            }
            segments.append(current)

    for segment in segments:
        segment["text"] = " ".join(segment["tokens"])

    return segments


def _score_segment_match(target_text: str, candidate_text: str) -> float:
    target_norm = _normalize_for_match(target_text)
    candidate_norm = _normalize_for_match(candidate_text)
    if not target_norm or not candidate_norm:
        return 0.0

    target_tokens = _token_set(target_norm)
    candidate_tokens = _token_set(candidate_norm)
    if not target_tokens or not candidate_tokens:
        return 0.0

    intersection = len(target_tokens.intersection(candidate_tokens))
    union = len(target_tokens.union(candidate_tokens))
    jaccard = intersection / union if union > 0 else 0.0

    contains_bonus = 0.0
    if target_norm in candidate_norm or candidate_norm in target_norm:
        contains_bonus = 0.15

    return min(1.0, jaccard + contains_bonus)


def _overlap_ms(start_a: float, end_a: float, start_b: float, end_b: float) -> float:
    return max(0.0, min(end_a, end_b) - max(start_a, start_b))


def _map_local_speakers_to_canonical(
    *,
    segments_abs: list[dict],
    speaker_history: list[dict],
    min_overlap_ms: float,
) -> dict[str, str]:
    mapping: dict[str, str] = {}
    local_ids = {str(segment.get("speaker_id") or "") for segment in segments_abs if segment.get("speaker_id")}

    for local_id in local_ids:
        overlap_by_canonical: dict[str, float] = {}
        local_segments = [segment for segment in segments_abs if segment.get("speaker_id") == local_id]

        for segment in local_segments:
            seg_start = float(segment.get("start_ms") or 0.0)
            seg_end = float(segment.get("end_ms") or seg_start)
            for hist in speaker_history:
                overlap = _overlap_ms(seg_start, seg_end, float(hist["start_ms"]), float(hist["end_ms"]))
                if overlap <= 0:
                    continue
                canonical_id = str(hist["speaker_id"])
                overlap_by_canonical[canonical_id] = overlap_by_canonical.get(canonical_id, 0.0) + overlap

        if overlap_by_canonical:
            best_canonical = max(overlap_by_canonical, key=overlap_by_canonical.get)
            if overlap_by_canonical[best_canonical] >= min_overlap_ms:
                mapping[local_id] = best_canonical

    return mapping


def _best_canonical_for_local_by_overlap(
    *,
    local_speaker_id: str,
    segments_abs: list[dict],
    speaker_history: list[dict],
) -> tuple[str | None, float]:
    overlap_by_canonical: dict[str, float] = {}

    for segment in segments_abs:
        if str(segment.get("speaker_id") or "") != local_speaker_id:
            continue
        seg_start = float(segment.get("start_ms") or 0.0)
        seg_end = float(segment.get("end_ms") or seg_start)
        for hist in speaker_history:
            overlap = _overlap_ms(seg_start, seg_end, float(hist["start_ms"]), float(hist["end_ms"]))
            if overlap <= 0:
                continue
            canonical_id = str(hist["speaker_id"])
            overlap_by_canonical[canonical_id] = overlap_by_canonical.get(canonical_id, 0.0) + overlap

    if not overlap_by_canonical:
        return None, 0.0

    best_canonical = max(overlap_by_canonical, key=overlap_by_canonical.get)
    return best_canonical, overlap_by_canonical[best_canonical]


def _canonicalize_speaker_ids_by_first_appearance(segments: list[dict]) -> dict[str, str]:
    first_seen: dict[str, float] = {}
    for segment in segments:
        speaker_id = str(segment.get("speaker_id") or "").strip()
        if not speaker_id:
            continue
        start = float(segment.get("start_ms") or 0.0)
        if speaker_id not in first_seen or start < first_seen[speaker_id]:
            first_seen[speaker_id] = start

    ordered = sorted(first_seen.items(), key=lambda pair: pair[1])
    mapping: dict[str, str] = {}
    for index, (local_id, _) in enumerate(ordered, start=1):
        mapping[local_id] = f"speaker_{index}"
    return mapping


def _score_segment_alignment(
    *,
    target_text: str,
    target_start_ms: float,
    target_end_ms: float,
    candidate_text: str,
    candidate_start_ms: float,
    candidate_end_ms: float,
) -> float:
    text_score = _score_segment_match(target_text, candidate_text)
    overlap = _overlap_ms(target_start_ms, target_end_ms, candidate_start_ms, candidate_end_ms)
    target_len = max(1.0, target_end_ms - target_start_ms)
    overlap_ratio = min(1.0, overlap / target_len)
    return (0.7 * text_score) + (0.3 * overlap_ratio)


def _reconcile_segments_with_diarization(
    *,
    source_segments: list[dict],
    diarized_segments: list[dict],
) -> list[dict]:
    canonical_map = _canonicalize_speaker_ids_by_first_appearance(diarized_segments)
    reconciled: list[dict] = []

    for index, source in enumerate(source_segments):
        source_text = str(source.get("text") or "")
        source_start_ms = float(source.get("timestamp_ms") or 0.0)

        if index + 1 < len(source_segments):
            next_start_ms = float(source_segments[index + 1].get("timestamp_ms") or source_start_ms)
            source_end_ms = next_start_ms if next_start_ms > source_start_ms else source_start_ms + 3500.0
        else:
            source_end_ms = source_start_ms + 3500.0

        best_candidate: dict | None = None
        best_score = 0.0
        for candidate in diarized_segments:
            candidate_speaker = str(candidate.get("speaker_id") or "").strip()
            if not candidate_speaker:
                continue

            score = _score_segment_alignment(
                target_text=source_text,
                target_start_ms=source_start_ms,
                target_end_ms=source_end_ms,
                candidate_text=str(candidate.get("text") or ""),
                candidate_start_ms=float(candidate.get("start_ms") or 0.0),
                candidate_end_ms=float(candidate.get("end_ms") or 0.0),
            )
            if score > best_score:
                best_score = score
                best_candidate = candidate

        if not best_candidate:
            fallback_speaker = "speaker_1"
            if reconciled:
                fallback_speaker = str(reconciled[-1].get("speaker_id") or "speaker_1")

            reconciled.append({
                "speaker_id": fallback_speaker,
                "confidence": 0.0,
            })
            continue

        local_speaker_id = str(best_candidate.get("speaker_id") or "").strip()
        speaker_id = canonical_map.get(local_speaker_id, local_speaker_id or "speaker_1")
        reconciled.append({
            "speaker_id": speaker_id,
            "confidence": round(best_score, 3),
        })

    return reconciled


# ── Prompts ────────────────────────────────────────────────────────────────────

EXTRACTION_SYSTEM_PROMPT = open("prompts/extraction.txt").read()
AUDIT_SYSTEM_PROMPT = open("prompts/audit.txt").read()

# ── Auth ──────────────────────────────────────────────────────────────────

def verify_token(token = Depends(security)):
    user = supabase.auth.get_user(token.credentials)
    if not user:
        raise HTTPException(status_code=401)
    return user

# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.post("/generate-note", response_model=SOAPNote)
async def generate_note(req: GenerateNoteRequest, user = Depends(verify_token)):
    """Accepts transcript, returns structured SOAP note via Claude."""
    try:
        response = openrouter_client.chat.completions.create(
            model=INFERENCE_MODEL,
            max_tokens=2048,
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"Generate a SOAP note from this consultation transcript:\n\n{req.transcript}",
                },
            ],
        )

        raw = strip_fences(extract_text(response))
        data = json.loads(raw)

        supabase.table("consultations").insert({
            "created_by": user.user.id,
            "soap": data,
        }).execute()
        
        return SOAPNote(**data)

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Model returned invalid JSON: {e}")
    except Exception as e:
        print(f"Error in /generate-note: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/audit", response_model=AuditResponse)
async def audit_note(req: AuditRequest, user = Depends(verify_token)):
    """Sends SOAP note to IBM watsonx.ai for quality scoring (or Claude fallback)."""
    try:
        ibm_enabled = _env_flag("IBM_WATSONX_ENABLED", default=True)
        debug_ibm_errors = _env_flag("DEBUG_IBM_WATSONX_ERRORS", default=False)
        ibm_api_key = (os.getenv("IBM_WATSONX_API_KEY") or "").strip()
        ibm_project_id = (os.getenv("IBM_WATSONX_PROJECT_ID") or "").strip()
        ibm_url = (os.getenv("IBM_WATSONX_URL") or "https://us-south.ml.cloud.ibm.com").strip().rstrip("/")

        missing_reasons: list[str] = []
        if not ibm_enabled:
            missing_reasons.append("IBM_WATSONX_ENABLED=false")
        if not ibm_api_key:
            missing_reasons.append("missing IBM_WATSONX_API_KEY")
        if not ibm_project_id:
            missing_reasons.append("missing IBM_WATSONX_PROJECT_ID")
        if not _is_valid_url(ibm_url):
            missing_reasons.append("invalid IBM_WATSONX_URL")

        if not missing_reasons:
            try:
                print("Attempting audit with IBM WatsonX...")
                return await _audit_with_watsonx(req.soap_note, ibm_api_key, ibm_project_id, ibm_url)
            except Exception as ibm_err:
                if debug_ibm_errors:
                    print(f"IBM WatsonX audit failed ({ibm_err}), falling back to inference server")
                else:
                    print("IBM WatsonX audit unavailable; falling back to inference server")
                return await _audit_with_openrouter_fallback(req.soap_note)
        else:
            print(
                "IBM WatsonX audit not configured properly "
                f"({', '.join(missing_reasons)}), using inference server fallback"
            )
            return await _audit_with_openrouter_fallback(req.soap_note)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _audit_with_watsonx(note: str, api_key: str, project_id: str, url: str) -> AuditResponse:
    from ibm_watsonx_ai import APIClient, Credentials
    from ibm_watsonx_ai.foundation_models import ModelInference

    credentials_kwargs = {
        "url": url,
        "api_key": api_key,
    }
    instance_id = (os.getenv("IBM_WATSONX_INSTANCE_ID") or "").strip()
    if instance_id:
        credentials_kwargs["instance_id"] = instance_id

    credentials = Credentials(**credentials_kwargs)
    client = APIClient(credentials)

    model = ModelInference(
        model_id="meta-llama/llama-3-3-70b-instruct",
        api_client=client,
        project_id=project_id,
        params={"max_new_tokens": 512, "temperature": 0.1},
    )

    prompt = f"""Audit this SOAP clinical note and return ONLY valid JSON:
{{
  "quality_score": 0-100,
  "completeness_score": 0-100,
  "flagged_terms": ["non-standard abbreviations or unclear terms"],
  "consistency_notes": "brief note on plan/assessment alignment"
}}

SOAP Note:
{note}"""

    response = model.generate_text(prompt=prompt)
    data = parse_first_json_object(
        response.strip(),
        preferred_keys={"quality_score", "completeness_score", "flagged_terms", "consistency_notes"},
    )
    return _coerce_audit_response(data)


def _coerce_audit_response(data: dict) -> AuditResponse:
    quality_score = int(data.get("quality_score", 0))
    quality_score = max(0, min(100, quality_score))

    completeness_raw = data.get("completeness_score", quality_score)
    completeness_score = int(completeness_raw)
    completeness_score = max(0, min(100, completeness_score))

    flagged_terms = data.get("flagged_terms") or []
    if not isinstance(flagged_terms, list):
        flagged_terms = []
    flagged_terms = [str(term) for term in flagged_terms if str(term).strip()]

    consistency_notes = str(data.get("consistency_notes", "")).strip()

    return AuditResponse(
        quality_score=quality_score,
        completeness_score=completeness_score,
        flagged_terms=flagged_terms,
        consistency_notes=consistency_notes,
    )


async def _audit_with_openrouter_fallback(note: str) -> AuditResponse:
    response = openrouter_client.chat.completions.create(
        model=INFERENCE_MODEL,
        max_tokens=768,
        messages=[
            {"role": "system", "content": AUDIT_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Return ONLY valid JSON with this exact schema:\n"
                    "{\n"
                    "  \"quality_score\": 0-100,\n"
                    "  \"completeness_score\": 0-100,\n"
                    "  \"flagged_terms\": [\"term\"],\n"
                    "  \"consistency_notes\": \"brief note on alignment\"\n"
                    "}\n\n"
                    "SOAP Note:\n"
                    f"{note}"
                ),
            },
        ],
    )

    data = parse_first_json_object(
        extract_text(response),
        preferred_keys={"quality_score", "completeness_score", "flagged_terms", "consistency_notes"},
    )
    return _coerce_audit_response(data)


@app.post("/reconcile-speakers", response_model=ReconcileSpeakersResponse)
async def reconcile_speakers(req: ReconcileSpeakersRequest, user = Depends(verify_token)):
    elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY")
    if not elevenlabs_api_key:
        raise HTTPException(status_code=500, detail="Missing ELEVENLABS_API_KEY in backend environment")

    if not req.segments:
        return ReconcileSpeakersResponse(segments=[])

    try:
        audio_bytes = base64.b64decode(req.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio payload")

    filename = (req.filename or "audio.webm").strip() or "audio.webm"

    try:
        async with httpx.AsyncClient() as http_client:
            words = await _run_batch_diarization_file(
                api_key=elevenlabs_api_key,
                http_client=http_client,
                file_bytes=audio_bytes,
                filename=filename,
                language_code=ELEVENLABS_LANGUAGE_CODE,
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Speaker reconciliation failed: {exc}")

    diarized_segments_raw = _segment_words_by_speaker(words)
    diarized_segments: list[dict] = []
    for segment in diarized_segments_raw:
        start_ms = float(segment.get("start") or 0.0) * 1000
        end_ms = float(segment.get("end") or 0.0) * 1000
        diarized_segments.append({
            "speaker_id": str(segment.get("speaker_id") or "").strip(),
            "text": str(segment.get("text") or ""),
            "start_ms": start_ms,
            "end_ms": max(start_ms, end_ms),
        })

    source_segments = [
        {
            "text": segment.text,
            "timestamp_ms": segment.timestamp_ms,
        }
        for segment in req.segments
    ]
    reconciled_raw = _reconcile_segments_with_diarization(
        source_segments=source_segments,
        diarized_segments=diarized_segments,
    )

    reconciled: list[ReconcileSpeakersResult] = []
    for segment, assignment in zip(req.segments, reconciled_raw):
        reconciled.append(
            ReconcileSpeakersResult(
                text=segment.text,
                timestamp_ms=segment.timestamp_ms,
                speaker_id=str(assignment.get("speaker_id") or "speaker_1"),
                confidence=float(assignment.get("confidence") or 0.0),
            )
        )

    return ReconcileSpeakersResponse(segments=reconciled)

# ── WebSocket: client ↔ ElevenLabs realtime transcription proxy ─────────────

ELEVENLABS_REALTIME_URL = os.getenv(
    "ELEVENLABS_REALTIME_URL",
    "wss://api.elevenlabs.io/v1/speech-to-text/realtime",
)
ELEVENLABS_MODEL_ID = os.getenv("ELEVENLABS_MODEL_ID", "scribe_v2_realtime")
ELEVENLABS_AUDIO_FORMAT = os.getenv("ELEVENLABS_AUDIO_FORMAT", "pcm_16000")
ELEVENLABS_LANGUAGE_CODE = os.getenv("ELEVENLABS_LANGUAGE_CODE", "en")
ELEVENLABS_INCLUDE_TIMESTAMPS = os.getenv("ELEVENLABS_INCLUDE_TIMESTAMPS", "true").lower() == "true"
ELEVENLABS_COMMIT_STRATEGY = os.getenv("ELEVENLABS_COMMIT_STRATEGY", "vad")
ELEVENLABS_VAD_THRESHOLD = float(os.getenv("ELEVENLABS_VAD_THRESHOLD", "0.3"))
ELEVENLABS_DIARIZATION_ENABLED = _env_flag("ELEVENLABS_DIARIZATION_ENABLED", default=True)
ELEVENLABS_BATCH_STT_URL = os.getenv("ELEVENLABS_BATCH_STT_URL", "https://api.elevenlabs.io/v1/speech-to-text")
ELEVENLABS_BATCH_MODEL_ID = os.getenv("ELEVENLABS_BATCH_MODEL_ID", "scribe_v2")
ELEVENLABS_SAMPLE_RATE = int(os.getenv("ELEVENLABS_SAMPLE_RATE", "16000"))
ELEVENLABS_DIARIZATION_PADDING_BEFORE_MS = int(os.getenv("ELEVENLABS_DIARIZATION_PADDING_BEFORE_MS", "5000"))
ELEVENLABS_DIARIZATION_PADDING_AFTER_MS = int(os.getenv("ELEVENLABS_DIARIZATION_PADDING_AFTER_MS", "2500"))
ELEVENLABS_MIN_COMMIT_CHARS = int(os.getenv("ELEVENLABS_MIN_COMMIT_CHARS", "8"))
ELEVENLABS_MATCH_MIN_SCORE = float(os.getenv("ELEVENLABS_MATCH_MIN_SCORE", "0.12"))
ELEVENLABS_MIN_OVERLAP_MS = float(os.getenv("ELEVENLABS_MIN_OVERLAP_MS", "120"))
ELEVENLABS_MAX_CANONICAL_SPEAKERS = int(os.getenv("ELEVENLABS_MAX_CANONICAL_SPEAKERS", "2"))
ELEVENLABS_SPEAKER_HISTORY_WINDOW_MS = int(os.getenv("ELEVENLABS_SPEAKER_HISTORY_WINDOW_MS", "120000"))
ELEVENLABS_COMMIT_RETRY_ATTEMPTS = int(os.getenv("ELEVENLABS_COMMIT_RETRY_ATTEMPTS", "5"))
ELEVENLABS_COMMIT_RETRY_DELAY_MS = int(os.getenv("ELEVENLABS_COMMIT_RETRY_DELAY_MS", "400"))
ELEVENLABS_COMMIT_MAX_RETRY_DELAY_MS = int(os.getenv("ELEVENLABS_COMMIT_MAX_RETRY_DELAY_MS", "1800"))
ELEVENLABS_COMMIT_DEDUP_WINDOW_MS = int(os.getenv("ELEVENLABS_COMMIT_DEDUP_WINDOW_MS", "2500"))
ELEVENLABS_LIVE_MIN_CONFIDENCE = float(os.getenv("ELEVENLABS_LIVE_MIN_CONFIDENCE", "0.72"))
ELEVENLABS_LIVE_MATCH_MIN_SCORE = float(os.getenv("ELEVENLABS_LIVE_MATCH_MIN_SCORE", "0.35"))

def _build_elevenlabs_realtime_url() -> str:
    query = {
        "model_id": ELEVENLABS_MODEL_ID,
        "audio_format": ELEVENLABS_AUDIO_FORMAT,
        "language_code": ELEVENLABS_LANGUAGE_CODE,
        "include_timestamps": str(ELEVENLABS_INCLUDE_TIMESTAMPS).lower(),
        "commit_strategy": ELEVENLABS_COMMIT_STRATEGY,
        "vad_silence_threshold_secs": ELEVENLABS_VAD_THRESHOLD
    }
    return f"{ELEVENLABS_REALTIME_URL}?{urlencode(query)}"


async def _run_batch_diarization(
    *,
    api_key: str,
    http_client: httpx.AsyncClient,
    wav_audio: bytes,
    language_code: str,
) -> list[dict]:
    files = {
        "file": ("audio.wav", wav_audio, "audio/wav"),
    }
    data = {
        "model_id": ELEVENLABS_BATCH_MODEL_ID,
        "language_code": language_code,
        "diarize": "true",
        "timestamps_granularity": "word",
    }

    response = await http_client.post(
        ELEVENLABS_BATCH_STT_URL,
        headers={"xi-api-key": api_key},
        data=data,
        files=files,
        timeout=45,
    )
    response.raise_for_status()
    payload = response.json()
    words = payload.get("words")
    return words if isinstance(words, list) else []


async def _run_batch_diarization_file(
    *,
    api_key: str,
    http_client: httpx.AsyncClient,
    file_bytes: bytes,
    filename: str,
    language_code: str,
) -> list[dict]:
    files = {
        "file": (filename, file_bytes, "application/octet-stream"),
    }
    data = {
        "model_id": ELEVENLABS_BATCH_MODEL_ID,
        "language_code": language_code,
        "diarize": "true",
        "timestamps_granularity": "word",
    }

    response = await http_client.post(
        ELEVENLABS_BATCH_STT_URL,
        headers={"xi-api-key": api_key},
        data=data,
        files=files,
        timeout=90,
    )
    response.raise_for_status()
    payload = response.json()
    words = payload.get("words")
    return words if isinstance(words, list) else []


@app.websocket("/ws/realtime-transcript")
async def websocket_realtime_transcript(websocket: WebSocket):
    await websocket.accept()

    elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY")
    if not elevenlabs_api_key:
        await websocket.send_json({
            "type": "error",
            "message": "Missing ELEVENLABS_API_KEY in backend environment",
        })
        await websocket.close(code=1011)
        return

    elevenlabs_url = _build_elevenlabs_realtime_url()
    pcm_timeline = bytearray()
    audio_cursor_ms = 0.0
    audio_lock = asyncio.Lock()
    commits_lock = asyncio.Lock()
    committed_segments: list[dict] = []
    emitted_assignments: dict[str, str] = {}
    recent_commits: list[dict] = []
    resolution_queue: asyncio.Queue = asyncio.Queue()
    resolution_worker_task: asyncio.Task | None = None
    http_client = httpx.AsyncClient()

    async def reconcile_live_segments_and_emit():
        if not ELEVENLABS_DIARIZATION_ENABLED:
            return

        async with commits_lock:
            segments_snapshot = [dict(item) for item in committed_segments]
        if not segments_snapshot:
            return

        async with audio_lock:
            audio_copy = bytes(pcm_timeline)
        if len(audio_copy) < 3200:
            return

        wav_audio = _pcm16le_to_wav_bytes(audio_copy, sample_rate=ELEVENLABS_SAMPLE_RATE, channels=1)

        try:
            words = await _run_batch_diarization(
                api_key=elevenlabs_api_key,
                http_client=http_client,
                wav_audio=wav_audio,
                language_code=ELEVENLABS_LANGUAGE_CODE,
            )
        except Exception:
            return

        diarized_segments_raw = _segment_words_by_speaker(words)
        diarized_segments: list[dict] = []
        for segment in diarized_segments_raw:
            start_ms = float(segment.get("start") or 0.0) * 1000
            end_ms = float(segment.get("end") or 0.0) * 1000
            diarized_segments.append({
                "speaker_id": str(segment.get("speaker_id") or "").strip(),
                "text": str(segment.get("text") or ""),
                "start_ms": start_ms,
                "end_ms": max(start_ms, end_ms),
            })

        source_segments = [
            {
                "text": str(item.get("text") or ""),
                "timestamp_ms": int(item.get("timestamp_ms") or 0),
            }
            for item in segments_snapshot
        ]
        assignments = _reconcile_segments_with_diarization(
            source_segments=source_segments,
            diarized_segments=diarized_segments,
        )

        for item, assignment in zip(segments_snapshot, assignments):
            commit_id = str(item.get("commit_id") or "").strip()
            if not commit_id:
                continue

            speaker_id = str(assignment.get("speaker_id") or "").strip()
            confidence = float(assignment.get("confidence") or 0.0)
            if not speaker_id:
                continue

            previous = emitted_assignments.get(commit_id)
            if previous == speaker_id:
                continue

            emitted_assignments[commit_id] = speaker_id

            try:
                await websocket.send_json({
                    "type": "speaker_reconciled",
                    "commit_id": commit_id,
                    "speaker_id": speaker_id,
                    "confidence": round(confidence, 3),
                })
            except WebSocketDisconnect:
                return

    async def speaker_resolution_worker():
        while True:
            item = await resolution_queue.get()
            try:
                if item is None:
                    return

                while not resolution_queue.empty():
                    try:
                        queued_item = resolution_queue.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                    if queued_item is None:
                        item = None
                    resolution_queue.task_done()

                if item is None:
                    return

                await reconcile_live_segments_and_emit()
            finally:
                resolution_queue.task_done()

    try:
        async with websockets.connect(
            elevenlabs_url,
            extra_headers={"xi-api-key": elevenlabs_api_key},
            ping_interval=20,
            ping_timeout=20,
            max_size=2_000_000,
        ) as eleven_ws:
            await websocket.send_json({"type": "ready"})
            resolution_worker_task = asyncio.create_task(speaker_resolution_worker())

            async def forward_client_audio_to_elevenlabs():
                nonlocal audio_cursor_ms
                while True:
                    try:
                        payload_raw = await websocket.receive_text()
                    except WebSocketDisconnect:
                        try:
                            await eleven_ws.close()
                        except ConnectionClosed:
                            pass
                        return

                    try:
                        payload = json.loads(payload_raw)
                    except json.JSONDecodeError:
                        continue

                    payload_type = payload.get("type")

                    if payload_type == "audio_chunk":
                        raw_chunk = payload.get("audio_base64", "")
                        try:
                            chunk_bytes = base64.b64decode(raw_chunk)
                        except Exception:
                            chunk_bytes = b""

                        if chunk_bytes:
                            async with audio_lock:
                                pcm_timeline.extend(chunk_bytes)
                                audio_cursor_ms += (len(chunk_bytes) / 2 / ELEVENLABS_SAMPLE_RATE) * 1000

                        message = {
                            "message_type": "input_audio_chunk",
                            "audio_base_64": raw_chunk,
                        }
                        if ELEVENLABS_AUDIO_FORMAT.startswith("pcm"):
                            message["sample_rate"] = 16000
                        if payload.get("commit") is True:
                            message["commit"] = True
                        try:
                            await eleven_ws.send(json.dumps(message))
                        except ConnectionClosed:
                            return
                    elif payload_type == "commit":
                        # With VAD commit strategy, explicit empty commits are unnecessary.
                        continue
                    elif payload_type == "stop":
                        try:
                            await eleven_ws.close()
                        except ConnectionClosed:
                            pass
                        return

            async def forward_elevenlabs_to_client():
                async for server_msg_raw in eleven_ws:
                    try:
                        server_msg = json.loads(server_msg_raw)
                    except json.JSONDecodeError:
                        continue

                    message_type = server_msg.get("message_type", "")

                    if message_type == "session_started":
                        try:
                            await websocket.send_json({
                                "type": "session_started",
                                "session_id": server_msg.get("session_id"),
                            })
                        except WebSocketDisconnect:
                            return
                    elif message_type == "partial_transcript":
                        try:
                            await websocket.send_json({
                                "type": "partial",
                                "text": server_msg.get("text", ""),
                            })
                        except WebSocketDisconnect:
                            return
                    elif message_type in ("committed_transcript", "committed_transcript_with_timestamps"):
                        if ELEVENLABS_INCLUDE_TIMESTAMPS and message_type == "committed_transcript":
                            continue

                        timestamp_ms: int | None = None
                        words = server_msg.get("words") or []

                        if message_type == "committed_transcript_with_timestamps":
                            for token in words:
                                if token.get("type") == "word" and token.get("start") is not None:
                                    timestamp_ms = int(float(token["start"]) * 1000)
                                    break

                        committed_text = str(server_msg.get("text", ""))

                        if not committed_text.strip():
                            continue

                        normalized_committed = _normalize_for_match(committed_text)
                        if not normalized_committed:
                            continue

                        commit_id = uuid.uuid4().hex

                        if timestamp_ms is None:
                            async with audio_lock:
                                timestamp_ms = int(max(0.0, audio_cursor_ms - 500.0))

                        is_duplicate_commit = any(
                            abs(int(item["timestamp_ms"]) - int(timestamp_ms)) <= ELEVENLABS_COMMIT_DEDUP_WINDOW_MS
                            and (
                                item["text"] == normalized_committed
                                or item["text"].startswith(normalized_committed)
                                or normalized_committed.startswith(item["text"])
                            )
                            for item in recent_commits
                        )
                        if is_duplicate_commit:
                            continue

                        recent_commits.append({
                            "text": normalized_committed,
                            "timestamp_ms": int(timestamp_ms),
                        })
                        if len(recent_commits) > 60:
                            del recent_commits[:-60]

                        async with commits_lock:
                            committed_segments.append({
                                "commit_id": commit_id,
                                "text": committed_text,
                                "timestamp_ms": int(timestamp_ms),
                            })

                        try:
                            await websocket.send_json({
                                "type": "committed",
                                "commit_id": commit_id,
                                "text": committed_text,
                                "speaker_id": None,
                                "timestamp_ms": timestamp_ms,
                                "language_code": server_msg.get("language_code"),
                            })
                        except WebSocketDisconnect:
                            return

                        await resolution_queue.put({"tick": True})
                    elif "error" in message_type:
                        try:
                            await websocket.send_json({
                                "type": "error",
                                "message": server_msg.get("message", "Realtime transcription error"),
                            })
                        except WebSocketDisconnect:
                            return

            results = await asyncio.gather(
                forward_client_audio_to_elevenlabs(),
                forward_elevenlabs_to_client(),
                return_exceptions=True,
            )

            for result in results:
                if isinstance(result, Exception) and not isinstance(result, (WebSocketDisconnect, ConnectionClosed)):
                    raise result

    except Exception as e:
        if isinstance(e, ConnectionClosed):
            return
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        try:
            await resolution_queue.put(None)
        except Exception:
            pass

        if resolution_worker_task:
            await asyncio.gather(resolution_worker_task, return_exceptions=True)

        await http_client.aclose()


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
