import Anthropic from '@anthropic-ai/sdk';
import { callClaudeWithRetry, calculateCost, repairJson } from '@/lib/ai';
import { supabaseAdmin } from '@/lib/supabase';
import { extractDocumentTopics } from './topic-extractor';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function parseDocument(
  documentId: string,
  pdfBase64: string,
  title: string
): Promise<{ sections: any[]; cost: number }> {
  const startTime = Date.now();
  
  const cacheKey = `parse_${documentId}`;
  const { data: cached } = await supabaseAdmin
    .from('processing_cache')
    .select('output, id, hit_count')
    .eq('cache_key', cacheKey)
    .single();

  if (cached?.output) {
    console.log('[Parser] Cache hit - using cached parse result');
    await supabaseAdmin
      .from('processing_cache')
      .update({ hit_count: cached.hit_count + 1 })
      .eq('id', cached.id);
    
    await logCost(documentId, 'parsing', 'cache', 0, 0, 0, true, Date.now() - startTime);
    return { sections: cached.output.sections, cost: 0 };
  }

  const prompt = `You are analyzing an Australian energy market regulatory document. Parse this PDF into structured sections.

For each major section, extract:
- section_number (e.g., "4.2.1", "Schedule A")
- title (section heading)
- content (full text of the section)
- page_number (page where section starts)

Return JSON array:
[
  {
    "section_number": "1.1",
    "title": "Purpose",
    "content": "Full text...",
    "page_number": 1
  }
]

Focus on sections that contain obligations, requirements, or rules.
Include schedules and appendices.
Return ONLY valid JSON array, no explanation or markdown.`;

  const response = await callClaudeWithRetry(prompt, pdfBase64, 16000);
  const cost = calculateCost(response.inputTokens, response.outputTokens);

  let sections: any[] = [];
  try {
    // Try repair function first
    const cleaned = repairJson(response.text);
    sections = JSON.parse(cleaned);
    
    // Validate structure
    if (!Array.isArray(sections)) {
      throw new Error('Response is not an array');
    }
    
    // Ensure each section has required fields
    sections = sections.filter(s => 
      s.section_number && 
      s.title && 
      s.content && 
      typeof s.page_number === 'number'
    );
    
    if (sections.length === 0) {
      throw new Error('No valid sections found');
    }
    
    console.log(`[Parser] Successfully parsed ${sections.length} sections`);
  } catch (e) {
    console.error('[Parser] JSON parse failed. Response preview:', response.text.substring(0, 500));
    throw new Error('Failed to parse document structure');
  }

  // Cache the result
  await supabaseAdmin.from('processing_cache').insert({
    cache_key: cacheKey,
    operation: 'parsing',
    input_hash: documentId,
    output: { sections },
    model: 'claude-haiku-4-5-20251001',
    tokens_used: response.inputTokens + response.outputTokens,
    cost,
  });

  await logCost(documentId, 'parsing', 'claude-haiku-4-5-20251001', response.inputTokens, response.outputTokens, cost, false, Date.now() - startTime);

  // Extract topics for document intelligence
  const firstPageText = sections.slice(0, 3).map(s => s.content).join('\n');
  await extractDocumentTopics(documentId, title, firstPageText);

  return { sections, cost };
}

export async function logCost(
  documentId: string,
  operation: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cost: number,
  cacheHit: boolean,
  durationMs: number
): Promise<void> {
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
