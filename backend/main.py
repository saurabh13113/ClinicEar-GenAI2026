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

# Primary: hackathon HuggingFace endpoint
LLM_BASE_URL  = os.getenv("LLM_BASE_URL", "https://qyt7893blb71b5d3.us-east-2.aws.endpoints.huggingface.cloud/v1")
LLM_API_KEY   = os.getenv("LLM_API_KEY", "dummy")
MODEL_NAME    = os.getenv("MODEL_NAME", "tgi")

# Backup: OpenRouter (used if OPENROUTER_API_KEY is set and primary fails)
OPENROUTER_API_KEY   = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL     = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.1-8b-instruct:free")

llm_client = openai.OpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)
openrouter_client = openai.OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY or "no-key",
)

# Whisper uses the real OpenAI endpoint if OPENAI_API_KEY is set, otherwise primary endpoint
_whisper_key = os.getenv("OPENAI_API_KEY")
whisper_client = openai.OpenAI(api_key=_whisper_key) if _whisper_key else llm_client


def chat_with_fallback(messages: list, max_tokens: int = 2048) -> str:
    """Try primary LLM endpoint, fall back to OpenRouter on failure."""
    try:
        response = llm_client.chat.completions.create(
            model=MODEL_NAME,
            max_tokens=max_tokens,
            messages=messages,
        )
        return response.choices[0].message.content.strip()
    except Exception as primary_err:
        if not OPENROUTER_API_KEY:
            raise primary_err
        response = openrouter_client.chat.completions.create(
            model=OPENROUTER_MODEL,
            max_tokens=max_tokens,
            messages=messages,
        )
        return response.choices[0].message.content.strip()


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
            result = whisper_client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="text",
            )

        os.unlink(tmp_path)
        return TranscribeResponse(transcript=str(result))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-note", response_model=SOAPNote)
async def generate_note(req: GenerateNoteRequest):
    """Accepts transcript, returns structured SOAP note via Claude."""
    try:
        raw = chat_with_fallback(
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": f"Generate a SOAP note from this consultation transcript:\n\n{req.transcript}"},
            ],
            max_tokens=2048,
        )
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        return SOAPNote(**data)

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Claude returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/audit", response_model=AuditResponse)
async def audit_note(req: AuditRequest):
    """Sends SOAP note to IBM watsonx.ai for quality scoring (or Claude fallback)."""
    try:
        ibm_api_key = os.getenv("IBM_WATSONX_API_KEY")
        ibm_project_id = os.getenv("IBM_WATSONX_PROJECT_ID")

        if ibm_api_key and ibm_project_id:
            return await _audit_with_watsonx(req.soap_note, ibm_api_key, ibm_project_id)
        else:
            return await _audit_with_claude_fallback(req.soap_note)

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
        model_id="ibm/granite-13b-instruct-v2",
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


async def _audit_with_claude_fallback(note: str) -> AuditResponse:
    """Use LLM endpoint as fallback auditor when IBM credentials not available."""
    audit_prompt = """You are a clinical documentation auditor. Audit this SOAP note and return ONLY valid JSON:
{
  "quality_score": 0-100,
  "completeness_score": 0-100,
  "flagged_terms": ["list of non-standard abbreviations or unclear medical terms"],
  "consistency_notes": "brief assessment of plan/assessment alignment"
}"""

    raw = chat_with_fallback(
        messages=[
            {"role": "system", "content": audit_prompt},
            {"role": "user", "content": f"Audit this SOAP note:\n\n{note}"},
        ],
        max_tokens=512,
    )
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
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
