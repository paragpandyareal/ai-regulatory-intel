import { callClaude, calculateCost, repairJsonArray } from '@/lib/ai';
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
  const relevantSections = sections.filter(s => s.has_obligations);

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

    // Split large sections into chunks to avoid token limits
    const chunks = splitContent(section.content, 3000);
    const sectionObligations: ExtractedObligation[] = [];

    for (const chunk of chunks) {
      const response = await callClaude(
        `You are an Australian energy regulation expert. Extract ALL obligations from this document section.

SECTION ${section.section_number}: ${section.title}
---
${chunk}
---

RESPOND WITH ONLY VALID JSON - an array of obligations:
[
  {
    "extracted_text": "The exact obligation text",
    "context": "1-2 surrounding sentences for context",
    "section_number": "${section.section_number}",
    "page_number": ${section.page_start},
    "keywords": ["must", "shall"],
    "obligation_type": "binding",
    "confidence": 0.95
  }
]

CLASSIFICATION RULES:
- "binding": Contains "must", "shall", "is required to", "is obligated to"
- "guidance": Contains "should", "may", "is recommended"
- "definition": Defines a term ("means", "refers to", "is defined as")
- "example": Illustrative content

CONFIDENCE: 0.9-1.0 for clear "must/shall", 0.7-0.89 for likely, 0.5-0.69 for ambiguous.

If NO obligations found, return: []

IMPORTANT: Keep your response concise. For extracted_text, use the key sentence only (max 2 sentences). For context, use 1 sentence.

RESPOND WITH ONLY THE JSON ARRAY.`
      );

      let obligations: ExtractedObligation[];
      try {
        const repaired = repairJsonArray(response.text);
        obligations = JSON.parse(repaired);
      } catch {
        console.error(`[Extractor] Failed to parse for section ${section.section_number}, chunk. Attempting line-by-line repair.`);
        obligations = [];
      }

      const cost = calculateCost(response.inputTokens, response.outputTokens);
      await logCost(documentId, 'extraction', 'claude-haiku-4.5', response.inputTokens, response.outputTokens, cost, false, Date.now() - startTime);
      sectionObligations.push(...obligations);
    }

    // Cache all obligations for this section
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
  }

  return deduplicateObligations(allObligations);
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
      return intersection.size / union.size > 0.9;
    });
    if (!isDupe) unique.push(ob);
  }
  return unique;
}
