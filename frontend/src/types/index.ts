export type SessionStatus = 'idle' | 'recording' | 'processing' | 'done';

export interface TranscriptLine {
  id: string;
  speaker: 'Doctor' | 'Patient' | 'Unknown';
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
}

export interface AuditResult {
  quality_score: number;
  completeness_score: number;
  flagged_terms: string[];
  consistency_notes: string;
}
