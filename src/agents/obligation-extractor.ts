import { geminiFlash } from '@/lib/gemini';
import { supabaseAdmin } from '@/lib/supabase';
import { calculateGeminiCost, logCost } from './document-parser';

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

  // Only process sections flagged as having obligations
  const relevantSections = sections.filter(s => s.has_obligations);

  for (const section of relevantSections) {
    const startTime = Date.now();
    const cacheKey = `extract_${documentId}_${section.section_number}`;

    // Check cache
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

    // Call Gemini for this section
    const result = await geminiFlash.generateContent([
      {
        text: `You are an Australian energy regulation expert. Extract ALL obligations from this document section.

SECTION ${section.section_number}: ${section.title}
---
${section.content}
---

RESPOND WITH ONLY VALID JSON - an array of obligations matching this schema:
[
  {
    "extracted_text": "The exact obligation text from the document",
    "context": "1-2 surrounding sentences for context",
    "section_number": "${section.section_number}",
    "page_number": ${section.page_start},
    "keywords": ["must", "shall", etc - the obligation trigger words found],
    "obligation_type": "binding | guidance | definition | example",
    "confidence": 0.0 to 1.0
  }
]

CLASSIFICATION RULES:
- "binding": Contains "must", "shall", "is required to", "is obligated to", "is to" in a directive sense
- "guidance": Contains "should", "may", "is recommended", "is encouraged"
- "definition": Defines a term, concept, or scope (look for "means", "refers to", "is defined as")
- "example": Illustrative content, worked examples, or explanatory notes

CONFIDENCE SCORING:
- 0.9-1.0: Clear obligation language ("must", "shall") with specific action and responsible party
- 0.7-0.89: Likely obligation but language is slightly ambiguous
- 0.5-0.69: Possible obligation, needs human review
- Below 0.5: Unlikely to be an obligation

If this section contains NO obligations, return an empty array: []

RESPOND WITH ONLY THE JSON ARRAY. No markdown, no code fences, no explanation.`,
      },
    ]);

    const responseText = result.response.text().trim();

    let obligations: ExtractedObligation[];
    try {
      const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      obligations = JSON.parse(cleanJson);
    } catch (e) {
      console.error(`Failed to parse obligations for section ${section.section_number}`);
      obligations = [];
    }

    // Get token usage
    const usage = result.response.usageMetadata;
    const inputTokens = usage?.promptTokenCount || 0;
    const outputTokens = usage?.candidatesTokenCount || 0;
    const cost = calculateGeminiCost(inputTokens, outputTokens);

    // Cache result
    await supabaseAdmin.from('processing_cache').insert({
      cache_key: cacheKey,
      operation: 'extraction',
      input_hash: `${documentId}_${section.section_number}`,
      output: obligations,
      model: 'gemini-2.0-flash',
      tokens_used: inputTokens + outputTokens,
      cost,
    });

    await logCost(documentId, 'extraction', 'gemini-2.0-flash', inputTokens, outputTokens, cost, false, Date.now() - startTime);

    allObligations.push(...obligations);
  }

  // Deduplicate obligations with similar text (>90% overlap)
  const deduplicated = deduplicateObligations(allObligations);

  return deduplicated;
}

function deduplicateObligations(obligations: ExtractedObligation[]): ExtractedObligation[] {
  const unique: ExtractedObligation[] = [];

  for (const obligation of obligations) {
    const isDuplicate = unique.some(existing => {
      const similarity = textSimilarity(existing.extracted_text, obligation.extracted_text);
      return similarity > 0.9;
    });

    if (!isDuplicate) {
      unique.push(obligation);
    }
  }

  return unique;
}

function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}
