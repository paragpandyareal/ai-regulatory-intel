-- Add date columns to obligations table
ALTER TABLE obligations 
ADD COLUMN IF NOT EXISTS commencement_date DATE,
ADD COLUMN IF NOT EXISTS commencement_date_text TEXT,
ADD COLUMN IF NOT EXISTS date_confidence TEXT;

-- Add topic columns to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS topics JSONB,
ADD COLUMN IF NOT EXISTS jurisdictions JSONB,
ADD COLUMN IF NOT EXISTS impacted_systems JSONB;

-- Create index for fast date queries
CREATE INDEX IF NOT EXISTS idx_obligations_commencement_date 
ON obligations(commencement_date) 
WHERE commencement_date IS NOT NULL;

-- Create index for topic searches
CREATE INDEX IF NOT EXISTS idx_documents_topics 
ON documents USING GIN (topics);

-- Create index for calendar queries (cross-document obligations by date)
CREATE INDEX IF NOT EXISTS idx_obligations_date_type 
ON obligations(commencement_date, obligation_type) 
WHERE commencement_date IS NOT NULL;
