import { callClaude, calculateCost } from '@/lib/ai';
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

  const response = await callClaude(
    `You are a regulatory document parser specializing in Australian energy sector documents (AEMO, AEMC, AER).

Analyze this PDF and extract its structure into JSON format.

You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanation.

The JSON must match this schema:
{
  "title": "Full document title",
  "document_type": "Procedure",
  "effective_date": "YYYY-MM-DD or null",
  "version": "version string or null",
  "total_pages": 5,
  "sections": [
    {
      "section_number": "1.1",
      "title": "Section title",
      "content": "Full text content of this section",
      "page_start": 1,
      "page_end": 1,
      "has_obligations": true
    }
  ]
}

RULES:
- Extract ALL sections including appendices
- Preserve exact section numbering
- Set has_obligations to true if section contains "must", "shall", "required to", "obligated to"
- Include complete text content per section
- Do NOT skip or summarize content

RESPOND WITH ONLY THE JSON OBJECT.`,
    pdfBase64
  );

  const responseText = response.text.trim();
  let parsed: ParsedDocument;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    try {
      const clean = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        console.error('[Parser] Failed. Response:', responseText.substring(0, 1000));
        throw new Error('AI returned invalid JSON for document parsing');
      }
    }
  }

  const cost = calculateCost(response.inputTokens, response.outputTokens);

  await supabaseAdmin.from('processing_cache').insert({
    cache_key: cacheKey,
    operation: 'parsing',
    input_hash: documentId,
    output: parsed,
    model: 'claude-haiku-4.5',
    tokens_used: response.inputTokens + response.outputTokens,
    cost,
  });

  await logCost(documentId, 'parsing', 'claude-haiku-4.5', response.inputTokens, response.outputTokens, cost, false, Date.now() - startTime);
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
