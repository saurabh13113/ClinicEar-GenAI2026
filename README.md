# ClinicEar — AI Clinical Note Generator
GenAI Genesis 2026 | Sun Life + IBM Tracks

## What It Does

Canada is facing a growing physician shortage. There are not enough doctors, the ones we have are stretched thin, and nearly two hours of every physician's day gets consumed by paperwork rather than patients. That gap is what inspired ClinicEar.

ClinicEar listens to a doctor-patient consultation in real time and automatically handles all clinical documentation — so the physician can stay fully present in the conversation rather than splitting their attention between the patient and a keyboard. When the session ends, a structured SOAP note is ready and automatically exported to the existing patient record. No typing, no dictating, no catching up after hours.

Patients also walk away with something tangible: a plain-language summary of their consultation they can actually understand, with the option to receive a digital copy by email — helping them stay informed and proactive about their own health.

The system is designed to be **database-agnostic**, plugging into existing healthcare record systems with minimal setup. This makes ClinicEar inherently mobile:

- A physician can work across multiple clinics and immediately access patient context from any connected database
- Doctors travelling to high-demand or underserved communities can walk in and start delivering care without onboarding overhead
- By cutting documentation time, physicians can move through more patients per day — reducing wait times and expanding access to care in communities that need it most

## Key Features

- **Real-time transcription** — streams audio through ElevenLabs Scribe v2 with live Doctor/Patient speaker labels
- **AI SOAP note generation** — extracts subjective, objective, assessment, and plan sections with ICD-10 code suggestions, confidence scores per section, and documentation gap flags
- **Patient summary** — generates a plain-language version of the consultation the patient can keep for their own records
- **Multilingual patient summary** — before emailing, patients can select their preferred language and receive their summary translated for easier comprehension of medical terminology
- **Automatic export** — finished SOAP note is written directly into the patient's record when the session ends
- **Patient email delivery** — patients can optionally receive a digital copy of their summary by email via Resend
- **IBM watsonx.ai audit** — scores note completeness 0–100 and flags non-standard terminology, with automatic fallback if IBM credentials are unavailable
- **Patient lookup** — search existing patients by name or health number before the session starts
- **Session history** — recent consultations surface on the pre-session screen for quick patient reselection
- **Supabase auth** — JWT-based login gates all API endpoints (access / refresh tokens)

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

## How to Use

1. Sign in or create an account
2. Search for a patient by name or health number
3. Select the patient and click **Confirm**
4. Click **Start Consultation** to begin live recording, or **Demo Mode** to run a scripted consultation
5. Speak naturally — the transcript streams in real time on the left panel
6. Click **End Consultation** when finished
7. The SOAP note generates automatically on the right panel
8. Review confidence scores and documentation gaps
9. The SOAP note is automatically exported to the healthcare record system
10. Optionally, email the patient summary directly to the patient — before sending, the patient can select their preferred language so the summary is translated into their mother tongue for easier comprehension

## Requirements

- Python 3.11+
- Node.js 18+
- A Supabase project with the `patients` and `consultations` tables created (see schema below)

### Python Dependencies
```
railtracks
fastapi==0.115.0
uvicorn[standard]==0.30.6
python-multipart==0.0.9
websockets==13.1
httpx==0.27.2
openai>=1.68.2
python-dotenv==1.0.1
ibm-watsonx-ai>=1.4.0
pydantic>=2.9.2
supabase
resend
```

Install with:
```bash
pip install -r requirements.txt
```

### Database Schema
```sql
create table patients (
  id          uuid primary key default gen_random_uuid(),
  health_num  int8 unique not null check (health_num > 0),
  first_name  text not null,
  last_name   text not null,
  dob         date,
  preferred_language    text,
  created_at  timestamptz default now()
);

create table consultations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  created_by  uuid references auth.users(id) on delete cascade,
  patient_id  uuid references patients(id) on delete cascade,
  soap        jsonb not null
);
```

## Environment Variables

### Backend (`backend/.env`)
| Variable | Required | Description |
|---|---|---|
| `ELEVENLABS_API_KEY` | Yes | Realtime transcription via ElevenLabs Scribe |
| `OPENROUTER_API_KEY` | Yes | SOAP note generation and audit fallback |
| `OPENAI_API_KEY` | Yes | Translation and fallback inference |
| `RESEND_API_KEY` | Yes | Patient summary email delivery |
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

## Built With

- **FastAPI** — Python backend and WebSocket proxy
- **ElevenLabs Scribe v2** — real-time speech-to-text with speaker diarization
- **Railtracks** — agentic AI orchestration for SOAP note generation pipeline
- **OpenRouter / Hugging Face** — SOAP note generation and audit fallback
- **GPT-OSS 120B** — translation and fallback inference
- **IBM watsonx.ai** — clinical note quality scoring (Llama 3.3 70B Instruct)
- **React 18 + TypeScript + Vite** — frontend
- **Tailwind CSS** — styling
- **Supabase** — authentication and database
- **Resend** — patient summary email delivery
- **Vercel** — frontend deployment
- **Koyeb** — backend deployment