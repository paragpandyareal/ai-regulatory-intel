export type DocumentSource = 'AEMO' | 'AEMC' | 'AER' | 'ESB';
export type DocumentType = 'Procedure' | 'Rulebook' | 'Market_Notice' | 'Consultation';
export type DocumentStatus = 'Draft' | 'Consultation' | 'Final';
export type ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type Jurisdiction = 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'ACT' | 'NT';

export type ObligationType = 'binding' | 'guidance' | 'definition' | 'example';
export type ImplementationType = 'system_change' | 'process_change' | 'both' | 'no_change';
export type EffortEstimate = 'trivial' | 'small' | 'medium' | 'large';
export type CacheOperation = 'parsing' | 'extraction' | 'classification' | 'embedding';

export interface Document {
  id: string;
  title: string;
  source: DocumentSource;
  document_type: DocumentType;
  jurisdiction: Jurisdiction[];
  effective_date: string | null;
  version: string | null;
  status: DocumentStatus;
  file_url: string | null;
  file_hash: string | null;
  extraction_status: ExtractionStatus;
  processing_cost: number;
  total_obligations: number;
  uploaded_at: string;
  processed_at: string | null;
}

export interface Obligation {
  id: string;
  document_id: string;
  extracted_text: string;
  context: string | null;
  obligation_type: ObligationType | null;
  confidence: number | null;
  section_number: string | null;
  page_number: number | null;
  keywords: string[];
  stakeholders: string[];
  impacted_systems: string[];
  implementation_type: ImplementationType | null;
  estimated_effort: EffortEstimate | null;
  deadline: string | null;
  classification_reasoning: string | null;
  stakeholder_reasoning: string | null;
  implementation_reasoning: string | null;
  human_validated: boolean;
  created_at: string;
}

export interface ProcessingCache {
  id: string;
  cache_key: string;
  operation: CacheOperation;
  input_hash: string | null;
  output: any;
  model: string | null;
  tokens_used: number;
  cost: number;
  hit_count: number;
  created_at: string;
}

export interface CostLog {
  id: string;
  document_id: string | null;
  operation: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost: number;
  duration_ms: number;
  cache_hit: boolean;
  created_at: string;
}
