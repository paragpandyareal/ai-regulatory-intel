import { callClaude, calculateCost, repairJsonArray, repairJsonObject } from '@/lib/ai';
import { supabaseAdmin } from '@/lib/supabase';

interface ParsedSection {
  section_number: string;
  title: string;
  content: string;
  page_start: number;
  page_end: number;
  has_obligations: boolean;
}

interface ParsedDocument {
  title: string;
  document_type: string;
  effective_date: string | null;
  version: string | null;
  total_pages: number;
  sections: ParsedSection[];
}

export async function parseDocument(
  pdfBase64: string,
  documentId: string
): Promise<ParsedDocument> {
  const startTime = Date.now();

  const cacheKey = `parse_${documentId}`;
  const { data: cached } = await supabaseAdmin
    .from('processing_cache')
    .select('output, id, hit_count')
    .eq('cache_key', cacheKey)
    .single();

  if (cached) {
    await supabaseAdmin
      .from('processing_cache')
      .update({ hit_count: cached.hit_count + 1 })
      .eq('id', cached.id);
    await logCost(documentId, 'parsing', 'cache', 0, 0, 0, true, Date.now() - startTime);
    return cached.output as ParsedDocument;
  }

  // Single call: get structure + extract obligation text in one pass
  // Ask Claude to only return the obligation-relevant sentences, not full content
  const response = await callClaude(
    `You are a regulatory document parser for Australian energy sector documents (AEMO, AEMC, AER, ESB, ESC).

Analyze this PDF and extract:
1. Document metadata
2. ALL sections with their obligation-relevant content

RESPOND WITH ONLY VALID JSON:
{
  "title": "Full document title",
  "document_type": "Procedure or Rule or Guideline",
  "effective_date": "YYYY-MM-DD or null",
  "version": "version string or null",
  "total_pages": 90,
  "sections": [
    {
      "section_number": "1.1",
      "title": "Section title",
      "content": "Only sentences containing obligations - those with must/shall/required/should/may/means/refers to. Include 1 sentence of context before each obligation.",
      "page_start": 1,
      "page_end": 3,
      "has_obligations": true
    }
  ]
}

CRITICAL RULES:
- List ALL sections including appendices
- For has_obligations=true sections: include ONLY sentences with obligation language (must, shall, required to, should, may, means, refers to) plus 1 sentence of context each
- For has_obligations=false sections: set content to empty string ""
- This keeps the response compact enough to fit
- Preserve exact section numbering

RESPOND WITH ONLY THE JSON OBJECT. No markdown fences.`,
    pdfBase64,
    32000
  );

  const cost = calculateCost(response.inputTokens, response.outputTokens);
  await logCost(documentId, 'parsing', 'claude-haiku-4.5', response.inputTokens, response.outputTokens, cost, false, Date.now() - startTime);

  let parsed: ParsedDocument;
  try {
    const cleaned = repairJsonObject(response.text);
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('[Parser] Failed to parse. First 2000 chars:', response.text.substring(0, 2000));
    throw new Error('AI returned invalid JSON for document parsing');
  }

  // Cache
  await supabaseAdmin.from('processing_cache').insert({
    cache_key: cacheKey,
    operation: 'parsing',
    input_hash: documentId,
    output: parsed,
    model: 'claude-haiku-4.5',
    tokens_used: response.inputTokens + response.outputTokens,
    cost,
  });

  console.log(`[Parser] Found ${parsed.sections.length} sections, ${parsed.sections.filter(s => s.has_obligations).length} with obligations`);
  return parsed;
}

async function logCost(
  documentId: string,
  operation: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cost: number,
  cacheHit: boolean,
  durationMs: number
) {
  await supabaseAdmin.from('cost_log').insert({
    document_id: documentId,
    operation,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost,
    cache_hit: cacheHit,
    duration_ms: durationMs,
  });
}

export { calculateCost, logCost };
