import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { logCost } from './document-parser';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function classifyObligations(documentId: string, obligations: any[]): Promise<number> {
  const startTime = Date.now();
  let totalCost = 0;

  // Get document context for date extraction
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('title')
    .eq('id', documentId)
    .single();

  const BATCH_SIZE = 5;
  for (let i = 0; i < obligations.length; i += BATCH_SIZE) {
    const batch = obligations.slice(i, i + BATCH_SIZE);

    const prompt = `You are analyzing regulatory obligations from an Australian energy market document titled "${doc?.title || 'Unknown'}".

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
      "commencementDate": "YYYY-MM-DD or null",
      "commencementDateText": "Original text or null",
      "dateConfidence": "high | medium | low | null",
      "reasoning": "Brief explanation"
    }
  ]
}

## CRITICAL DATE EXTRACTION RULES - READ CAREFULLY

### ONLY EXTRACT COMMENCEMENT DATES

A commencement date is WHEN A NEW RULE/REGULATION/REQUIREMENT STARTS TO APPLY.

**EXTRACT THESE (Commencement of NEW rules):**
✅ "This rule commences on 1 February 2026"
✅ "The rule takes effect on 1 July 2026"
✅ "These obligations take effect from 1 July 2026"
✅ "Effective from 1 October 2026"
✅ "Apply from 1 February 2026"
✅ "Come into force on 1 July 2026"
✅ "Retailers are required to comply by 1 July 2026"
✅ "Must be implemented by 1 February 2026"

**DO NOT EXTRACT THESE (Other types of dates):**
❌ "Published on 12 September 2025" (publication/determination date)
❌ "Made on 5 May 2025" (creation date)
❌ "Revoked on X date" or "revocation takes effect" (ending of OLD rules)
❌ "Contracts starting before 1 July 2020" (contract dates in examples)
❌ "Data from the period 1 Jan to 31 Dec" (reporting periods)
❌ "Consultation closed on X" (process dates)
❌ "Before [date]" or "prior to [date]" when discussing historical context
❌ Any date that is NOT when a NEW obligation/regulation STARTS

### CONTEXT CLUES FOR COMMENCEMENT DATES

Look for these KEY PHRASES that indicate commencement:
- "takes effect"
- "comes into force"
- "commences"
- "applies from"
- "effective from"
- "must comply by"
- "required by"
- "implementation date"

### EXAMPLES WITH REASONING

**Example 1:**
Text: "The rule will take effect on 1 July 2026. Retailers are required to review their processes by this date."
→ commencementDate: "2026-07-01" (CORRECT - this is when the NEW rule starts)
→ dateConfidence: "high"

**Example 2:**
Text: "This code was published on 12 September 2025 and will commence on 1 February 2026"
→ commencementDate: "2026-02-01" (CORRECT - ignore publication, extract commencement)
→ dateConfidence: "high"

**Example 3:**
Text: "The revocation of these codes will take effect on 12 September 2025"
→ commencementDate: null (CORRECT - this is about ENDING old rules, not starting new ones)

**Example 4:**
Text: "Applies to contracts entered into before 1 July 2020"
→ commencementDate: null (CORRECT - this is a contract date in an example, not rule commencement)

**Example 5:**
Text: "This determination was made on 25 September 2025"
→ commencementDate: null (CORRECT - this is when it was made, not when it starts)

**Example 6:**
Text: "existing regulations around maintaining benefits until the end of a contract period before 1 July 2020"
→ commencementDate: null (CORRECT - "before" indicates this is historical context, not commencement)

**Example 7:**
Text: "For this rule change, the rule takes effect 1 July 2026"
→ commencementDate: "2026-07-01" (CORRECT - clear commencement statement)
→ dateConfidence: "high"

### WHEN UNCERTAIN

If you see a date but you're NOT 100% CERTAIN it's a commencement date, set:
- commencementDate: null
- Add reasoning: "Date mentioned but unclear if commencement"

Better to miss a date than extract the wrong type of date.

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', // Using Sonnet 4 for better accuracy
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') continue;

    const cost = (response.usage.input_tokens * 0.003 + response.usage.output_tokens * 0.015) / 1000;
    totalCost += cost;

    let parsed: any;
    try {
      const text = content.text.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '');
      parsed = JSON.parse(text);
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

  await logCost(documentId, 'classification', 'claude-sonnet-4-20250514', 0, 0, totalCost, false, Date.now() - startTime);
  return totalCost;
}
