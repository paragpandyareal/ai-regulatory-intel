import { geminiFlash } from '@/lib/gemini';
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

  // Check cache first
  const cacheKey = `parse_${documentId}`;
  const { data: cached } = await supabaseAdmin
    .from('processing_cache')
    .select('output, id, hit_count')
    .eq('cache_key', cacheKey)
    .single();

  if (cached) {
    // Update hit count
    await supabaseAdmin
      .from('processing_cache')
      .update({ hit_count: cached.hit_count + 1 })
      .eq('id', cached.id);

    // Log cache hit
    await logCost(documentId, 'parsing', 'cache', 0, 0, 0, true, Date.now() - startTime);
    return cached.output as ParsedDocument;
  }

  // Call Gemini with the PDF
  const result = await geminiFlash.generateContent([
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: pdfBase64,
      },
    },
    {
      text: `You are a regulatory document parser specializing in Australian energy sector documents (AEMO, AEMC, AER).

Analyze this PDF and extract its structure into JSON format.

RESPOND WITH ONLY VALID JSON matching this exact schema:
{
  "title": "Full document title",
  "document_type": "Procedure | Rulebook | Market_Notice | Consultation",
  "effective_date": "YYYY-MM-DD or null",
  "version": "version string or null",
  "total_pages": number,
  "sections": [
    {
      "section_number": "e.g. 1.0, 2.1, 7.2.3",
      "title": "Section title",
      "content": "Full text content of this section",
      "page_start": number,
      "page_end": number,
      "has_obligations": true/false
    }
  ]
}

IMPORTANT RULES:
- Extract ALL sections, including appendices and schedules
- Preserve exact section numbering from the document
- Set has_obligations to true if the section contains words like "must", "shall", "required to", "obligated", "is to"
- Include the complete text content of each section
- Regulatory documents contain critical compliance information - do NOT skip or summarize content
- If you cannot determine a field, use null

RESPOND WITH ONLY THE JSON OBJECT. No markdown, no code fences, no explanation.`,
    },
  ]);

  const responseText = result.response.text().trim();

  // Parse the JSON response, handling potential markdown fences
  let parsed: ParsedDocument;
  try {
    const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(cleanJson);
  } catch (e) {
    console.error('Failed to parse Gemini response:', responseText.substring(0, 500));
    throw new Error('AI returned invalid JSON for document parsing');
  }

  // Get token usage from response
  const usage = result.response.usageMetadata;
  const inputTokens = usage?.promptTokenCount || 0;
  const outputTokens = usage?.candidatesTokenCount || 0;
  const cost = calculateGeminiCost(inputTokens, outputTokens);

  // Cache the result
  await supabaseAdmin.from('processing_cache').insert({
    cache_key: cacheKey,
    operation: 'parsing',
    input_hash: documentId,
    output: parsed,
    model: 'gemini-2.0-flash',
    tokens_used: inputTokens + outputTokens,
    cost,
  });

  // Log cost
  await logCost(documentId, 'parsing', 'gemini-2.0-flash', inputTokens, outputTokens, cost, false, Date.now() - startTime);

  return parsed;
}

function calculateGeminiCost(inputTokens: number, outputTokens: number): number {
  // Gemini 1.5 Flash pricing (per 1M tokens)
  // Free tier: 1,500 requests/day - but track cost anyway for demo
  const inputCost = (inputTokens / 1_000_000) * 0.075;
  const outputCost = (outputTokens / 1_000_000) * 0.30;
  return inputCost + outputCost;
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

export { calculateGeminiCost, logCost };
