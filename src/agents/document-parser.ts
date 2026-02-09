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
    await supabaseAdmin
      .from('processing_cache')
      .update({ hit_count: cached.hit_count + 1 })
      .eq('id', cached.id);
    await logCost(documentId, 'parsing', 'cache', 0, 0, 0, true, Date.now() - startTime);
    return cached.output as ParsedDocument;
  }

  // Call Gemini with the PDF
  const result = await geminiFlash.generateContent({
    contents: [{
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64,
          },
        },
        {
          text: `You are a regulatory document parser specializing in Australian energy sector documents (AEMO, AEMC, AER).

Analyze this PDF and extract its structure into JSON format.

You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanation before or after.

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
- Set has_obligations to true if section contains "must", "shall", "required to", "obligated to", "is to"
- Include complete text content per section
- Do NOT skip or summarize content

RESPOND WITH ONLY THE JSON OBJECT.`,
        },
      ],
    }],
  });

  const responseText = result.response.text().trim();
  console.log('[Parser] Raw response length:', responseText.length);
  console.log('[Parser] First 500 chars:', responseText.substring(0, 500));

  let parsed: ParsedDocument;
  try {
    // Try direct parse first
    parsed = JSON.parse(responseText);
  } catch (e1) {
    try {
      // Try removing markdown fences
      const cleanJson = responseText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsed = JSON.parse(cleanJson);
    } catch (e2) {
      // Try extracting JSON from the response
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          console.error('[Parser] Failed to parse. Full response:', responseText.substring(0, 2000));
          throw new Error('AI returned invalid JSON for document parsing');
        }
      } catch (e3) {
        console.error('[Parser] All parse attempts failed. Response:', responseText.substring(0, 2000));
        throw new Error('AI returned invalid JSON for document parsing');
      }
    }
  }

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

  await logCost(documentId, 'parsing', 'gemini-2.0-flash', inputTokens, outputTokens, cost, false, Date.now() - startTime);

  return parsed;
}

function calculateGeminiCost(inputTokens: number, outputTokens: number): number {
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
