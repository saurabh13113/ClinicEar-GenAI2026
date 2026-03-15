import os
import json
import base64
import asyncio
import tempfile
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

# Whisper transcription — uses Groq (free) if GROQ_API_KEY is set, else OpenAI
_groq_key = os.getenv("GROQ_API_KEY")
_openai_key = os.getenv("OPENAI_API_KEY")
if _groq_key:
    WHISPER_MODEL = "whisper-large-v3-turbo"
    openai_client = openai.OpenAI(
        api_key=_groq_key,
        base_url="https://api.groq.com/openai/v1",
    )
else:
    WHISPER_MODEL = "whisper-1"
    openai_client = openai.OpenAI(api_key=_openai_key)

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

class TranscribeRequest(BaseModel):
    audio_base64: str
    filename: str = "audio.webm"


class TranscribeResponse(BaseModel):
    transcript: str


class GenerateNoteRequest(BaseModel):
    transcript: str
    patient_id: str


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

@app.get("/consultations/recent")
async def recent_consultations(user = Depends(verify_token)):
    try:
        result = supabase.table("consultations")\
            .select("id, created_at, patient_id, soap, patients(first_name, last_name, health_num)")\
            .eq("created_by", user.user.id)\
            .order("created_at", desc=True)\
            .limit(5)\
            .execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/patients/search")
async def search_patients(q: str, user = Depends(verify_token)):
    try:
        query = supabase.table("patients")\
            .select("id, health_num, first_name, last_name, dob")

        if q.isdigit():
            low = int(q) * 10 ** (5 - len(q))
            high = low + 10 ** (5 - len(q)) - 1
            result = query.gte("health_num", low).lte("health_num", high).limit(10).execute()
        else:
            result = query\
                .or_(f"last_name.ilike.%{q}%,first_name.ilike.%{q}%")\
                .limit(10)\
                .execute()

        return result.data
    except Exception as e:
        print(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(req: TranscribeRequest, user = Depends(verify_token)):
    """Accepts base64-encoded audio, returns transcript via OpenAI Whisper."""
    try:
        audio_bytes = base64.b64decode(req.audio_base64)
        suffix = "." + req.filename.split(".")[-1] if "." in req.filename else ".webm"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name

        with open(tmp_path, "rb") as audio_file:
            result = openai_client.audio.transcriptions.create(
                model=WHISPER_MODEL,
                file=audio_file,
                response_format="text",
            )

        os.unlink(tmp_path)
        return TranscribeResponse(transcript=str(result))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
            "patient_id": req.patient_id,
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

    try:
        async with websockets.connect(
            elevenlabs_url,
            extra_headers={"xi-api-key": elevenlabs_api_key},
            ping_interval=20,
            ping_timeout=20,
            max_size=2_000_000,
        ) as eleven_ws:
            await websocket.send_json({"type": "ready"})

            async def forward_client_audio_to_elevenlabs():
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
                        message = {
                            "message_type": "input_audio_chunk",
                            "audio_base_64": payload.get("audio_base64", ""),
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

                        timestamp_ms = None
                        if message_type == "committed_transcript_with_timestamps":
                            words = server_msg.get("words") or []
                            for token in words:
                                if token.get("type") == "word" and token.get("start") is not None:
                                    timestamp_ms = int(float(token["start"]) * 1000)
                                    break

                        try:
                            await websocket.send_json({
                                "type": "committed",
                                "text": server_msg.get("text", ""),
                                "timestamp_ms": timestamp_ms,
                                "language_code": server_msg.get("language_code"),
                            })
                        except WebSocketDisconnect:
                            return
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


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
