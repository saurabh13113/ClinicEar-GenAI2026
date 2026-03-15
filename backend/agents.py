"""
ClinicalEar – Railtracks agent definitions.
Uses Railtracks (https://github.com/RailtownAI/railtracks) to orchestrate
the SOAP note generation pipeline with structured output and observability.
"""
import os
from pathlib import Path
from pydantic import BaseModel

import railtracks as rt
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

# ── LLM config ────────────────────────────────────────────────────────────────

_use_openrouter = bool(os.getenv("OPENROUTER_API_KEY"))
_api_base = (
    "https://openrouter.ai/api/v1"
    if _use_openrouter
    else os.getenv("LLM_BASE_URL", "https://qyt7893blb71b5d3.us-east-2.aws.endpoints.huggingface.cloud/v1")
)
_api_key = os.getenv("OPENROUTER_API_KEY", "test")
_model   = os.getenv("INFERENCE_MODEL", "openai/gpt-oss-120b")

EXTRACTION_SYSTEM_PROMPT = open(
    Path(__file__).resolve().parent / "prompts" / "extraction.txt"
).read()

# ── Output schema ─────────────────────────────────────────────────────────────

class SOAPNoteSchema(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str
    icd10_suggestions: list[str]
    confidence_scores: dict[str, float]
    gaps: list[str]
    patient_instructions: list[str] = []
    resource_queries: list[str] = []

# ── Railtracks agent + flow ───────────────────────────────────────────────────

_soap_llm = rt.llm.OpenAILLM(
    _model,
    api_base=_api_base,
    api_key=_api_key,
)

soap_agent = rt.agent_node(
    "ClinicalEar SOAP Generator",
    llm=_soap_llm,
    output_schema=SOAPNoteSchema,
    system_message=EXTRACTION_SYSTEM_PROMPT,
)

soap_flow = rt.Flow(
    name="soap_generation",
    entry_point=soap_agent,
)
