import { callClaudeWithRetry, calculateCost, repairJson } from '@/lib/ai';
import { supabaseAdmin } from '@/lib/supabase';
import { logCost } from './document-parser';

interface ExtractedObligation {
  extracted_text: string;
  context: string;
  section_number: string;
  page_number: number;
  keywords: string[];
  obligation_type: 'binding' | 'guidance' | 'definition' | 'example';
  confidence: number;
}

interface ParsedSection {
  section_number: string;
  title: string;
  content: string;
  page_start: number;
  page_end: number;
  has_obligations: boolean;
}

export async function extractObligations(
  sections: ParsedSection[],
  documentId: string
): Promise<ExtractedObligation[]> {
  const allObligations: ExtractedObligation[] = [];
  const relevantSections = sections.filter(s => s.has_obligations && s.content && s.content.trim().length > 0);

  console.log('[Extractor] Processing ' + relevantSections.length + ' sections with obligations');

  for (const section of relevantSections) {
    const startTime = Date.now();
    const cacheKey = `extract_${documentId}_${section.section_number}`;

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
      await logCost(documentId, 'extraction', 'cache', 0, 0, 0, true, Date.now() - startTime);
      allObligations.push(...(cached.output as ExtractedObligation[]));
      continue;
    }

    const chunks = splitContent(section.content, 3000);
    const sectionObligations: ExtractedObligation[] = [];

    for (const chunk of chunks) {
      const response = await callClaudeWithRetry(
        `You are an Australian energy regulation expert. Extract ALL obligations from this section text.

SECTION ${section.section_number}: ${section.title}
---
${chunk}
---

RESPOND WITH ONLY A VALID JSON ARRAY. No markdown, no explanation.

[
  {
    "extracted_text": "The exact obligation sentence (max 2 sentences)",
    "context": "1 sentence of surrounding context",
    "section_number": "${section.section_number}",
    "page_number": ${section.page_start},
    "keywords": ["must"],
    "obligation_type": "binding",
    "confidence": 0.95
  }
]

CLASSIFICATION:
- "binding": must, shall, is required to, is obligated to
- "guidance": should, may, is recommended
- "definition": means, refers to, is defined as
- "example": illustrative content

If NO obligations, return: []

RESPOND WITH ONLY THE JSON ARRAY.`,
        undefined,
        8000
      );

      try {
        const repaired = repairJson(response.text);
        const obligations = JSON.parse(repaired);
        if (Array.isArray(obligations)) {
          sectionObligations.push(...obligations);
        }
      } catch {
        console.error('[Extractor] JSON parse failed for section ' + section.section_number);
      }

      const cost = calculateCost(response.inputTokens, response.outputTokens);
      await logCost(documentId, 'extraction', 'claude-haiku-4.5', response.inputTokens, response.outputTokens, cost, false, Date.now() - startTime);
    }

    await supabaseAdmin.from('processing_cache').insert({
      cache_key: cacheKey,
      operation: 'extraction',
      input_hash: `${documentId}_${section.section_number}`,
      output: sectionObligations,
      model: 'claude-haiku-4.5',
      tokens_used: 0,
      cost: 0,
    });

    allObligations.push(...sectionObligations);
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  const deduped = deduplicateObligations(allObligations);
  console.log('[Extractor] ' + allObligations.length + ' raw -> ' + deduped.length + ' after dedup');
  return deduped;
}

function splitContent(content: string, maxChars: number): string[] {
  if (content.length <= maxChars) return [content];
  const chunks: string[] = [];
  const paragraphs = content.split(/\n\n+/);
  let current = '';
  for (const para of paragraphs) {
    if (current.length + para.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += '\n\n' + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function deduplicateObligations(obligations: ExtractedObligation[]): ExtractedObligation[] {
  const unique: ExtractedObligation[] = [];
  for (const ob of obligations) {
    const isDupe = unique.some(existing => {
      const wordsA = new Set(existing.extracted_text.toLowerCase().split(/\s+/));
      const wordsB = new Set(ob.extracted_text.toLowerCase().split(/\s+/));
      const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
      const union = new Set([...wordsA, ...wordsB]);
      return intersection.size / union.size > 0.85;
    });
    if (!isDupe) unique.push(ob);
  }
  return unique;
}
