import { callClaude, calculateCost, repairJsonArray } from '@/lib/ai';
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

  // Step 1: Get document structure (sections list only - no content)
  const structureResponse = await callClaude(
    `You are a regulatory document parser for Australian energy sector documents.

Analyze this PDF and list ALL sections with their metadata. Do NOT include section content text.

RESPOND WITH ONLY VALID JSON:
{
  "title": "Full document title",
  "document_type": "Procedure",
  "effective_date": "YYYY-MM-DD or null",
  "version": "version string or null",
  "total_pages": 90,
  "sections": [
    {
      "section_number": "1.1",
      "title": "Section title",
      "page_start": 1,
      "page_end": 3,
      "has_obligations": true
    }
  ]
}

RULES:
- List ALL sections including appendices
- Preserve exact section numbering from the document
- Set has_obligations to true if section contains "must", "shall", "required to", "obligated to", "is to"
- Do NOT include content field yet
- Keep response compact

RESPOND WITH ONLY THE JSON OBJECT.`,
    pdfBase64,
    8000
  );

  let structure: any;
  try {
    const cleaned = structureResponse.text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    structure = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
  } catch (e) {
    console.error('[Parser] Failed to parse structure:', structureResponse.text.substring(0, 1000));
    throw new Error('AI returned invalid JSON for document structure');
  }

  const costStructure = calculateCost(structureResponse.inputTokens, structureResponse.outputTokens);
  await logCost(documentId, 'parsing-structure', 'claude-haiku-4.5', structureResponse.inputTokens, structureResponse.outputTokens, costStructure, false, Date.now() - startTime);

  // Step 2: Get content for sections that have obligations (in batches)
  const obligationSections = (structure.sections || []).filter((s: any) => s.has_obligations);
  const batchSize = 10;
  const fullSections: ParsedSection[] = [];

  for (let i = 0; i < obligationSections.length; i += batchSize) {
    const batch = obligationSections.slice(i, i + batchSize);
    const sectionList = batch.map((s: any) => `Section ${s.section_number}: "${s.title}" (pages ${s.page_start}-${s.page_end})`).join('\n');

    const contentResponse = await callClaude(
      `Extract the FULL TEXT CONTENT for these specific sections from the PDF document.

SECTIONS TO EXTRACT:
${sectionList}

RESPOND WITH ONLY VALID JSON - an array:
[
  {
    "section_number": "1.1",
    "content": "Full verbatim text of this section"
  }
]

RULES:
- Include the COMPLETE text of each section
- Do not summarize - include all text verbatim
- If a section is very long, include at minimum all sentences containing "must", "shall", "required", "obligated", "should", "may"

RESPOND WITH ONLY THE JSON ARRAY.`,
      pdfBase64,
      16000
    );

    const costContent = calculateCost(contentResponse.inputTokens, contentResponse.outputTokens);
    await logCost(documentId, 'parsing-content', 'claude-haiku-4.5', contentResponse.inputTokens, contentResponse.outputTokens, costContent, false, Date.now() - startTime);

    let contents: any[];
    try {
      const repaired = repairJsonArray(contentResponse.text);
      contents = JSON.parse(repaired);
    } catch {
      console.error('[Parser] Failed to parse content batch', i);
      contents = [];
    }

    for (const sec of batch) {
      const contentMatch = contents.find((c: any) => c.section_number === sec.section_number);
      fullSections.push({
        section_number: sec.section_number,
        title: sec.title,
        content: contentMatch?.content || '',
        page_start: sec.page_start,
        page_end: sec.page_end,
        has_obligations: true,
      });
    }

    // Rate limit pause between batches
    if (i + batchSize < obligationSections.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Add non-obligation sections without content
  for (const sec of (structure.sections || [])) {
    if (!sec.has_obligations) {
      fullSections.push({
        section_number: sec.section_number,
        title: sec.title,
        content: '',
        page_start: sec.page_start,
        page_end: sec.page_end,
        has_obligations: false,
      });
    }
  }

  // Sort by section number
  fullSections.sort((a, b) => a.section_number.localeCompare(b.section_number, undefined, { numeric: true }));

  const parsed: ParsedDocument = {
    title: structure.title,
    document_type: structure.document_type,
    effective_date: structure.effective_date,
    version: structure.version,
    total_pages: structure.total_pages,
    sections: fullSections,
  };

  // Cache
  await supabaseAdmin.from('processing_cache').insert({
    cache_key: cacheKey,
    operation: 'parsing',
    input_hash: documentId,
    output: parsed,
    model: 'claude-haiku-4.5',
    tokens_used: 0,
    cost: 0,
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
