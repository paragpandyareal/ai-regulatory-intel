import { callClaudeWithRetry, calculateCost, repairJson } from '@/lib/ai';
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

  const response = await callClaudeWithRetry(
    `You are a regulatory document parser for Australian energy sector documents (AEMO, AEMC, AER, ESB, ESC).

Analyze this PDF and extract its structure with obligation-relevant content.

RESPOND WITH ONLY VALID JSON. No markdown fences, no explanation.

{
  "title": "Full document title",
  "document_type": "Procedure or Rule or Guideline or Code",
  "effective_date": "YYYY-MM-DD or null",
  "version": "version string or null",
  "total_pages": 90,
  "sections": [
    {
      "section_number": "1.1",
      "title": "Section title",
      "content": "Extract obligation sentences and 1 line of context each",
      "page_start": 1,
      "page_end": 3,
      "has_obligations": true
    }
  ]
}

CRITICAL RULES:
- List EVERY section in the document including appendices
- For sections WITH obligations (has_obligations=true):
  Extract ONLY sentences containing: must, shall, required to, obligated to, should, may, is to, means, refers to, is defined as.
  Include 1 sentence of context before each obligation sentence.
  Do NOT include full section text - just the obligation sentences with context.
- For sections WITHOUT obligations (has_obligations=false):
  Set content to "" (empty string)
- This approach keeps the response compact
- Preserve exact section numbering from the document

RESPOND WITH ONLY THE JSON OBJECT.`,
    pdfBase64,
    32000
  );

  const cost = calculateCost(response.inputTokens, response.outputTokens);
  await logCost(documentId, 'parsing', 'claude-haiku-4.5', response.inputTokens, response.outputTokens, cost, false, Date.now() - startTime);

  let parsed: ParsedDocument;
  try {
    const cleaned = repairJson(response.text);
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('[Parser] JSON parse failed. First 2000 chars:', response.text.substring(0, 2000));
    console.error('[Parser] Last 500 chars:', response.text.substring(response.text.length - 500));
    throw new Error('AI returned invalid JSON for document parsing');
  }

  if (!parsed.sections || !Array.isArray(parsed.sections)) {
    throw new Error('Parser returned no sections array');
  }

  console.log('[Parser] Found ' + parsed.sections.length + ' sections, ' + parsed.sections.filter(s => s.has_obligations).length + ' with obligations');

  await supabaseAdmin.from('processing_cache').insert({
    cache_key: cacheKey,
    operation: 'parsing',
    input_hash: documentId,
    output: parsed,
    model: 'claude-haiku-4.5',
    tokens_used: response.inputTokens + response.outputTokens,
    cost,
  });

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
