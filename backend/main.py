import os
import json
import base64
import asyncio
import tempfile
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import openai

load_dotenv()

app = FastAPI(title="ClinicalEar API")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

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


# ── Request / Response models ──────────────────────────────────────────────────

class TranscribeRequest(BaseModel):
    audio_base64: str
    filename: str = "audio.webm"


class TranscribeResponse(BaseModel):
    transcript: str


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


# ── Prompts ────────────────────────────────────────────────────────────────────

EXTRACTION_SYSTEM_PROMPT = """You are a clinical documentation AI. Given a doctor-patient conversation transcript,
extract structured clinical information and return ONLY valid JSON — no markdown, no explanation.

Return this exact JSON schema:
{
  "subjective": "patient-reported symptoms paraphrased in clinical language",
  "objective": "vitals, observations, and measurements mentioned",
  "assessment": "primary diagnosis or differential diagnoses extracted from physician speech",
  "plan": "prescribed medications, referrals, follow-ups, lifestyle instructions",
  "icd10_suggestions": ["ICD-10 code: description", ...],
  "confidence_scores": {
    "subjective": 0.0-1.0,
    "objective": 0.0-1.0,
    "assessment": 0.0-1.0,
    "plan": 0.0-1.0
  },
  "gaps": ["list of clinically expected fields not mentioned in the conversation"]
}

Rules:
- Write in clinical register (not layman language, not bullet points)
- Assign confidence < 0.7 if a section relies on inference rather than explicit mention
- gaps[] should list things like "blood pressure not recorded", "medication dosage unclear"
- icd10_suggestions must use real ICD-10 codes
"""


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(req: TranscribeRequest):
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
async def generate_note(req: GenerateNoteRequest):
    """Accepts transcript, returns structured SOAP note via OpenRouter."""
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
        return SOAPNote(**data)

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Model returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/audit", response_model=AuditResponse)
async def audit_note(req: AuditRequest):
    """Sends SOAP note to IBM watsonx.ai for quality scoring (or Claude fallback)."""
    try:
        ibm_api_key = os.getenv("IBM_WATSONX_API_KEY")
        ibm_project_id = os.getenv("IBM_WATSONX_PROJECT_ID")

        if ibm_api_key and ibm_project_id:
            try:
                return await _audit_with_watsonx(req.soap_note, ibm_api_key, ibm_project_id)
            except Exception as ibm_err:
                print(f"IBM WatsonX audit failed ({ibm_err}), falling back to inference server")
                return await _audit_with_openrouter_fallback(req.soap_note)
        else:
            return await _audit_with_openrouter_fallback(req.soap_note)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _audit_with_watsonx(note: str, api_key: str, project_id: str) -> AuditResponse:
    from ibm_watsonx_ai import APIClient, Credentials
    from ibm_watsonx_ai.foundation_models import ModelInference

    credentials = Credentials(
        url=os.getenv("IBM_WATSONX_URL", "https://us-south.ml.cloud.ibm.com"),
        api_key=api_key,
    )
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
    raw = response.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    data = json.loads(raw)
    return AuditResponse(**data)


async def _audit_with_openrouter_fallback(note: str) -> AuditResponse:
    """Use OpenRouter as fallback auditor when IBM credentials not available."""
    audit_prompt = """You are a clinical documentation auditor. Audit this SOAP note and return ONLY valid JSON:
{
  "quality_score": 0-100,
  "completeness_score": 0-100,
  "flagged_terms": ["list of non-standard abbreviations or unclear medical terms"],
  "consistency_notes": "brief assessment of plan/assessment alignment"
}"""

    response = openrouter_client.chat.completions.create(
        model=INFERENCE_MODEL,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": audit_prompt},
            {"role": "user", "content": f"Audit this SOAP note:\n\n{note}"},
        ],
    )

    raw = strip_fences(extract_text(response))
    data = json.loads(raw)
    return AuditResponse(**data)


# ── WebSocket for streaming transcript ────────────────────────────────────────

active_connections: list[WebSocket] = []


@app.websocket("/ws/transcript")
async def websocket_transcript(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back for now; real implementation streams Whisper chunks
            await websocket.send_text(data)
    except WebSocketDisconnect:
        active_connections.remove(websocket)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
