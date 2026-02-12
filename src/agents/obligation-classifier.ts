import { callClaudeWithRetry, calculateCost, repairJson } from '@/lib/ai';
import { supabaseAdmin } from '@/lib/supabase';
import { logCost } from './document-parser';

export async function classifyObligations(documentId: string, obligations: any[]): Promise<number> {
  const startTime = Date.now();
  let totalCost = 0;

  const BATCH_SIZE = 5;
  for (let i = 0; i < obligations.length; i += BATCH_SIZE) {
    const batch = obligations.slice(i, i + BATCH_SIZE);

    const prompt = `You are analyzing regulatory obligations from Australian energy market documents.

For each obligation below, classify it and extract key information.

Obligations:
${batch.map((ob, idx) => `[${idx + 1}] ID: ${ob.id}
Section: ${ob.section_number}
Text: ${ob.extracted_text}
`).join('\n')}

For each obligation, provide:

{
  "classifications": [
    {
      "id": "obligation_id_here",
      "obligationType": "binding | guidance | definition | example",
      "confidence": 0.0-1.0,
      "stakeholders": ["Retailer", "AEMO", "Distributor", etc],
      "impactedSystems": ["CRM", "Billing", "Market Operations", "Settlement", etc],
      "implementationType": "new_feature | config_change | process_change | no_change",
      "estimatedEffort": "trivial | small | medium | large",
      "commencementDate": "YYYY-MM-DD or null if not mentioned. Extract from text like 'from 1 February 2026', 'commencing 1 July 2026'",
      "commencementDateText": "Original text mentioning date, e.g. 'commencing 1 February 2026' or null",
      "dateConfidence": "high | medium | low | null (high if explicit date like '1 Feb 2026', medium if approximate like 'Q1 2026', low if unclear)",
      "reasoning": "Brief explanation of classification"
    }
  ]
}

CRITICAL RULES FOR DATE EXTRACTION:
- If text says "1 February 2026" or "from 1 February 2026" → commencementDate: "2026-02-01"
- If text says "1 July 2026" or "effective 1 July 2026" → commencementDate: "2026-07-01"
- If text says "1 October 2026" → commencementDate: "2026-10-01"
- If text says "Q1 2026" → commencementDate: "2026-01-01", dateConfidence: "medium"
- If no date mentioned → commencementDate: null, dateConfidence: null
- For phased rollouts, use EARLIEST date

Examples:
- "Retailers must comply from 1 February 2026" → "2026-02-01", high confidence
- "Effective July 2026" → "2026-07-01", medium confidence
- "To be determined" → null, null

Return ONLY valid JSON.`;

    const response = await callClaudeWithRetry(prompt, undefined, 8000);
    totalCost += calculateCost(response.inputTokens, response.outputTokens);

    let parsed: any;
    try {
      const cleaned = repairJson(response.text);
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('[Classifier] JSON parse failed, skipping batch');
      continue;
    }

    const classifications = parsed.classifications || [];

    for (const classification of classifications) {
      await supabaseAdmin
        .from('obligations')
        .update({
          obligation_type: classification.obligationType || 'guidance',
          confidence: classification.confidence || 0.5,
          stakeholders: classification.stakeholders || [],
          impacted_systems: classification.impactedSystems || [],
          implementation_type: classification.implementationType || 'no_change',
          estimated_effort: classification.estimatedEffort || 'medium',
          commencement_date: classification.commencementDate || null,
          commencement_date_text: classification.commencementDateText || null,
          date_confidence: classification.dateConfidence || null,
          classification_reasoning: classification.reasoning || '',
        })
        .eq('id', classification.id);
    }
  }

  await logCost(documentId, 'classification', 'claude-haiku-4-5-20251001', 0, 0, totalCost, false, Date.now() - startTime);
  return totalCost;
}
