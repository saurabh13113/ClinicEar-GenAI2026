export type SessionStatus = 'idle' | 'recording' | 'processing' | 'done';

export interface TranscriptLine {
  id: string;
  speaker: string;
  speakerId?: string;
  text: string;
  timestamp: number;
}

export interface SOAPNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  icd10_suggestions: string[];
  confidence_scores: {
    subjective: number;
    objective: number;
    assessment: number;
    plan: number;
  };
  gaps: string[];
  patient_instructions?: string[];
  resource_queries?: string[];
}

export interface AuditResult {
  quality_score: number;
  completeness_score: number;
  flagged_terms: string[];
  consistency_notes: string;
}

export interface Patient {
    id: string;
    health_num: number;
    first_name: string;
    last_name: string;
    preferred_language: string;
    dob: string;
  }



