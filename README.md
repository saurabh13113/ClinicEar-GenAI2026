# ClinicEar — AI Clinical Note Generator
GenAI Genesis 2026 | Sun Life + IBM Tracks

## What It Does

Canada is facing a growing physician shortage. There are not enough doctors, the ones we have are stretched thin, and nearly two hours of every physician's day gets consumed by paperwork rather than patients. That gap is what inspired ClinicEar.

ClinicEar listens to a doctor-patient consultation in real time, transcribes the conversation, and automatically generates a structured SOAP clinical note with ICD-10 suggestions, confidence scores, and a documentation quality audit. It is designed to be database-agnostic, meaning it can plug into existing healthcare record systems with minimal setup, so there is no lengthy onboarding process for new clinics or hospitals.

The bigger picture is mobility. We want a physician travelling to a high-demand or underserved area to be able to walk in, connect to the local patient database, and start delivering care immediately. No learning a new documentation system. No catching up on reports at the end of a long day. ClinicEar handles the notes so the doctor can focus on what they actually came to do.

## Key Features

- **Real-time transcription** — streams audio through ElevenLabs Scribe v2 with speaker-aware partial and committed transcripts
- **AI SOAP note generation** — extracts subjective, objective, assessment, and plan sections from the transcript with ICD-10 code suggestions and confidence scoring
- **Documentation gaps** — flags clinically relevant information missing from the conversation (allergies, smoking status, family history, etc.)
- **IBM watsonx.ai audit** — scores note completeness 0–100 and flags non-standard terminology, with automatic fallback to the inference server if IBM credentials are unavailable
- **Patient lookup** — search existing patients by name or health number before starting a session
- **Session history** — recent consultations surface on the pre-session screen for quick patient reselection
- **Demo mode** — runs a scripted consultation end-to-end without a microphone, safe for live judging demos
- **Supabase auth** — JWT-based login gates all API endpoints; no patient data is retained after the session

## Quick Start

### Backend
```bash
cd backend
cp .env.example .env        # fill in your API keys
pip install -r requirements.txt
python main.py              # runs on http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                 # runs on http://localhost:5173
```

## Environment Variables

### Backend (`backend/.env`)
| Variable | Required | Description |
|---|---|---|
| `ELEVENLABS_API_KEY` | Yes | Realtime transcription via ElevenLabs Scribe |
| `OPENROUTER_API_KEY` | Yes | SOAP note generation and audit fallback |
| `IBM_WATSONX_API_KEY` | No | IBM watsonx.ai audit — falls back to inference server if absent |
| `IBM_WATSONX_PROJECT_ID` | No | Required alongside IBM API key |
| `IBM_WATSONX_URL` | No | Defaults to `https://us-south.ml.cloud.ibm.com` |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key for JWT validation and DB writes |

### Frontend (`frontend/.env`)
| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Yes | Backend URL, e.g. `http://localhost:8000` |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key for client-side auth |

## How to Use

1. Sign in or create an account
2. Search for a patient by name or health number
3. Select the patient and click **Confirm**
4. Click **Start Consultation** to begin live recording, or **Demo Mode** to run a scripted consultation
5. Speak naturally — the transcript streams in real time on the left panel
6. Click **End Consultation** when finished
7. The SOAP note generates automatically on the right panel
8. Review confidence scores and documentation gaps
9. SOAP gets automatically exported to the healthcare record system, with the option to email the patient summary to email of choice

## Requirements

- Python 3.11+
- Node.js 18+
- A Supabase project with the `patients` and `consultations` tables created (see schema below)

### Python Dependencies
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
python-multipart==0.0.9
websockets==13.1
httpx==0.27.2
openai==1.51.2
python-dotenv==1.0.1
ibm-watsonx-ai>=1.4.0
pydantic>=2.9.2
supabase
```

- [Railtracks](https://github.com/RailtownAI/railtracks) — Canadian agentic AI framework used to orchestrate the SOAP note generation pipeline with structured output and observability


create table consultations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  created_by  uuid references auth.users(id) on delete cascade,
  patient_id  uuid references patients(id) on delete cascade,
  soap        jsonb not null
);
```

## Built With

- **FastAPI** — Python backend and WebSocket proxy
- **ElevenLabs Scribe v2** — real-time speech-to-text with speaker diarization
- **OpenRouter** — SOAP note generation and audit
- **IBM watsonx.ai** — clinical note quality scoring (Llama 3.3 70B Instruct)
- **React 18 + TypeScript + Vite** — frontend
- **Tailwind CSS** — styling
- **Supabase** — authentication and database
- **Vercel / Koyeb** - deployment