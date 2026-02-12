import { callClaudeWithRetry, calculateCost } from '@/lib/ai';
import { supabaseAdmin } from '@/lib/supabase';

export async function extractDocumentTopics(documentId: string, documentTitle: string, firstPageText: string): Promise<void> {
  const prompt = `Analyze this Australian energy regulatory document and extract metadata.

Document Title: ${documentTitle}
First Page Content: ${firstPageText.substring(0, 2000)}

Extract and return ONLY valid JSON:

{
  "topics": ["topic1", "topic2", "topic3"],
  "jurisdictions": ["NSW", "VIC", "QLD", "SA", "TAS", "NT", "WA", "ACT", "National"],
  "impactedSystems": ["CRM", "Billing", "Settlement", "Market Operations", "Metering", "Network", "Trading"]
}

Topic examples: "settlement", "market_participation", "billing", "metering", "retailer_obligations", "network_connection", "pricing", "compliance_reporting"

Only include jurisdictions if explicitly mentioned in the document.
Only include systems if the document impacts them.

Return ONLY the JSON object, no explanation.`;

  try {
    const response = await callClaudeWithRetry(prompt, undefined, 4000);
    
    let metadata: any;
    try {
      const cleaned = response.text.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '');
      metadata = JSON.parse(cleaned);
    } catch (e) {
      console.error('[Topic Extractor] JSON parse failed:', response.text);
      return;
    }

    await supabaseAdmin
      .from('documents')
      .update({
        topics: metadata.topics || [],
        jurisdictions: metadata.jurisdictions || [],
        impacted_systems: metadata.impactedSystems || [],
      })
      .eq('id', documentId);

    console.log('[Topic Extractor] Extracted topics:', metadata.topics);
  } catch (error) {
    console.error('[Topic Extractor] Failed to extract topics:', error);
  }
}
