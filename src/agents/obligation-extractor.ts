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
  page_number: number;
}

export async function extractObligations(
  sections: ParsedSection[],
  documentId: string
): Promise<ExtractedObligation[]> {
  const allObligations: ExtractedObligation[] = [];
  
  // Filter sections that have meaningful content
  const relevantSections = sections.filter(s => 
    s.content && 
    s.content.trim().length > 100 &&
    (s.content.toLowerCase().includes('must') ||
     s.content.toLowerCase().includes('shall') ||
     s.content.toLowerCase().includes('require') ||
     s.content.toLowerCase().includes('should') ||
     s.content.toLowerCase().includes('obligation'))
  );
  
  console.log(`[Extractor] Processing ${relevantSections.length} sections with potential obligations`);

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

    const prompt = `Extract regulatory obligations from this section.

SECTION: ${section.section_number} - ${section.title}
CONTENT: ${section.content}

Extract ALL obligations (must/shall/required statements). For each:

Return JSON array:
[
  {
    "extracted_text": "Full obligation text",
    "context": "Surrounding context",
    "section_number": "${section.section_number}",
    "page_number": ${section.page_number},
    "keywords": ["keyword1", "keyword2"],
    "obligation_type": "binding|guidance|definition|example",
    "confidence": 0.0-1.0
  }
]

If no obligations found, return empty array [].
Return ONLY valid JSON.`;

    const response = await callClaudeWithRetry(prompt, undefined, 8000);
    const cost = calculateCost(response.inputTokens, response.outputTokens);

    let sectionObligations: ExtractedObligation[] = [];
    try {
      const cleaned = repairJson(response.text);
      sectionObligations = JSON.parse(cleaned);
    } catch (e) {
      console.error(`[Extractor] JSON parse failed for section ${section.section_number}`);
      continue;
    }

    if (sectionObligations.length > 0) {
      // Store in obligations table
      const obligationsToInsert = sectionObligations.map(ob => ({
        document_id: documentId,
        extracted_text: ob.extracted_text,
        context: ob.context,
        section_number: ob.section_number,
        page_number: ob.page_number,
        keywords: ob.keywords || [],
        obligation_type: ob.obligation_type || 'guidance',
        confidence: ob.confidence || 0.5,
      }));

      await supabaseAdmin.from('obligations').insert(obligationsToInsert);

      // Cache the result
      await supabaseAdmin.from('processing_cache').insert({
        cache_key: cacheKey,
        operation: 'extraction',
        input_hash: section.section_number,
        output: sectionObligations,
        model: 'claude-haiku-4-5-20251001',
        tokens_used: response.inputTokens + response.outputTokens,
        cost,
      });

      allObligations.push(...sectionObligations);
    }

    await logCost(documentId, 'extraction', 'claude-haiku-4-5-20251001', response.inputTokens, response.outputTokens, cost, false, Date.now() - startTime);
  }

  // Deduplicate
  const uniqueObligations = Array.from(
    new Map(allObligations.map(o => [o.extracted_text, o])).values()
  );

  console.log(`[Extractor] ${allObligations.length} raw -> ${uniqueObligations.length} after dedup`);
  return uniqueObligations;
}
