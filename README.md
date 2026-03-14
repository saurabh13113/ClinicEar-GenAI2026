# ClinicalEar — AI Clinical Note Generator

GenAI Genesis 2026 | Sun Life + IBM Tracks

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

## API Keys needed
- `OPENAI_API_KEY` — for Whisper transcription
- `ANTHROPIC_API_KEY` — for Claude SOAP note generation
- `IBM_WATSONX_API_KEY` + `IBM_WATSONX_PROJECT_ID` — optional, falls back to Claude audit
