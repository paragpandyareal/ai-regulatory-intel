import { geminiFlash } from '@/lib/gemini';
import { supabaseAdmin } from '@/lib/supabase';
import { calculateGeminiCost, logCost } from './document-parser';

interface ClassificationResult {
  obligation_type: 'binding' | 'guidance' | 'definition' | 'example';
  confidence: number;
  reasoning: string;
}

interface StakeholderResult {
  stakeholders: string[];
  impacted_systems: string[];
  reasoning: string;
}

interface ImplementationResult {
  implementation_type: 'system_change' | 'process_change' | 'both' | 'no_change';
  estimated_effort: 'trivial' | 'small' | 'medium' | 'large';
  deadline: string | null;
  reasoning: string;
}

// AGENT 1: Classification Agent
async function classifyObligation(
  text: string,
  context: string,
  documentId: string
): Promise<ClassificationResult> {
  const startTime = Date.now();

  const result = await geminiFlash.generateContent([
    {
      text: `You are a regulatory classification specialist for Australian energy markets.

Classify this obligation and assess confidence.

OBLIGATION TEXT:
"${text}"

SURROUNDING CONTEXT:
"${context}"

RESPOND WITH ONLY VALID JSON:
{
  "obligation_type": "binding | guidance | definition | example",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of classification decision"
}

CLASSIFICATION RULES:
- "binding": Mandatory language - "must", "shall", "is required to", "is obligated to". These create legal/regulatory compliance requirements.
- "guidance": Advisory language - "should", "may", "is recommended", "is encouraged". Non-mandatory but expected practice.
- "definition": Defines terms, scope, or applicability. Look for "means", "refers to", "is defined as", "for the purposes of".
- "example": Illustrative content, worked examples, notes, or explanatory material.

CONFIDENCE RULES:
- 0.95-1.0: Unambiguous "must"/"shall" with clear action and party
- 0.85-0.94: Strong obligation language with minor ambiguity
- 0.70-0.84: Probable obligation but context-dependent
- 0.50-0.69: Ambiguous - could be obligation or guidance
- Below 0.50: Likely not an obligation

RESPOND WITH ONLY THE JSON OBJECT.`,
    },
  ]);

  const usage = result.response.usageMetadata;
  const inputTokens = usage?.promptTokenCount || 0;
  const outputTokens = usage?.candidatesTokenCount || 0;
  const cost = calculateGeminiCost(inputTokens, outputTokens);

  await logCost(documentId, 'classification', 'gemini-1.5-flash', inputTokens, outputTokens, cost, false, Date.now() - startTime);

  const responseText = result.response.text().trim();
  const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(cleanJson);
  } catch {
    return { obligation_type: 'guidance', confidence: 0.5, reasoning: 'Failed to parse AI response' };
  }
}

// AGENT 2: Stakeholder Agent
async function analyzeStakeholders(
  text: string,
  context: string,
  documentId: string
): Promise<StakeholderResult> {
  const startTime = Date.now();

  const result = await geminiFlash.generateContent([
    {
      text: `You are an Australian energy market stakeholder analyst.

Identify all stakeholders and impacted systems for this regulatory obligation.

OBLIGATION TEXT:
"${text}"

SURROUNDING CONTEXT:
"${context}"

RESPOND WITH ONLY VALID JSON:
{
  "stakeholders": ["list of affected parties"],
  "impacted_systems": ["list of affected IT/business systems"],
  "reasoning": "Brief explanation"
}

KNOWN STAKEHOLDERS in Australian energy:
- Retailer, DNSP (Distribution Network Service Provider), TNSP (Transmission), AEMO, AEMC, AER
- Metering Provider, Metering Data Provider, Embedded Network Manager
- Customer, Generator, Market Customer, Market Generator

KNOWN SYSTEMS:
- Billing, MSATS (Market Settlement and Transfer Solutions), B2B (Business to Business gateway)
- CRM, Metering, MDM (Meter Data Management), Market Systems, Settlements
- Customer Portal, Internal Compliance, Reporting, CATS (Customer Administration and Transfer Solution)

Only include stakeholders and systems that are DIRECTLY referenced or clearly implied.

RESPOND WITH ONLY THE JSON OBJECT.`,
    },
  ]);

  const usage = result.response.usageMetadata;
  const inputTokens = usage?.promptTokenCount || 0;
  const outputTokens = usage?.candidatesTokenCount || 0;
  const cost = calculateGeminiCost(inputTokens, outputTokens);

  await logCost(documentId, 'classification', 'gemini-1.5-flash', inputTokens, outputTokens, cost, false, Date.now() - startTime);

  const responseText = result.response.text().trim();
  const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(cleanJson);
  } catch {
    return { stakeholders: [], impacted_systems: [], reasoning: 'Failed to parse AI response' };
  }
}

// AGENT 3: Implementation Agent
async function analyzeImplementation(
  text: string,
  context: string,
  documentId: string
): Promise<ImplementationResult> {
  const startTime = Date.now();

  const result = await geminiFlash.generateContent([
    {
      text: `You are an energy sector implementation analyst. Assess what's needed to comply with this obligation.

OBLIGATION TEXT:
"${text}"

SURROUNDING CONTEXT:
"${context}"

RESPOND WITH ONLY VALID JSON:
{
  "implementation_type": "system_change | process_change | both | no_change",
  "estimated_effort": "trivial | small | medium | large",
  "deadline": "YYYY-MM-DD or null if no deadline mentioned",
  "reasoning": "Brief explanation of implementation assessment"
}

IMPLEMENTATION TYPE RULES:
- "system_change": Requires IT system modifications (new fields, API changes, data format changes, new integrations)
- "process_change": Requires business process updates (new procedures, staff training, documentation updates)
- "both": Requires both system and process changes
- "no_change": Informational only, no action required (definitions, background, existing practices)

EFFORT ESTIMATION:
- "trivial": Configuration change, documentation update (<1 day)
- "small": Minor system or process change (1-5 days)
- "medium": Significant change requiring development and testing (1-4 weeks)
- "large": Major system overhaul or new capability (1+ months)

RESPOND WITH ONLY THE JSON OBJECT.`,
    },
  ]);

  const usage = result.response.usageMetadata;
  const inputTokens = usage?.promptTokenCount || 0;
  const outputTokens = usage?.candidatesTokenCount || 0;
  const cost = calculateGeminiCost(inputTokens, outputTokens);

  await logCost(documentId, 'classification', 'gemini-1.5-flash', inputTokens, outputTokens, cost, false, Date.now() - startTime);

  const responseText = result.response.text().trim();
  const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(cleanJson);
  } catch {
    return { implementation_type: 'no_change', estimated_effort: 'small', deadline: null, reasoning: 'Failed to parse AI response' };
  }
}

// ORCHESTRATOR: Run all 3 agents in parallel for each obligation
export async function classifyObligations(
  obligations: Array<{
    extracted_text: string;
    context: string;
    section_number: string;
    page_number: number;
    keywords: string[];
    obligation_type: string;
    confidence: number;
  }>,
  documentId: string
): Promise<Array<{
  extracted_text: string;
  context: string;
  section_number: string;
  page_number: number;
  keywords: string[];
  obligation_type: string;
  confidence: number;
  stakeholders: string[];
  impacted_systems: string[];
  implementation_type: string;
  estimated_effort: string;
  deadline: string | null;
  classification_reasoning: string;
  stakeholder_reasoning: string;
  implementation_reasoning: string;
}>> {
  const classified = [];

  // Process in batches of 3 to respect rate limits
  for (let i = 0; i < obligations.length; i += 3) {
    const batch = obligations.slice(i, i + 3);

    const batchResults = await Promise.all(
      batch.map(async (obligation) => {
        // Run all 3 agents in parallel for this obligation
        const [classification, stakeholders, implementation] = await Promise.all([
          classifyObligation(obligation.extracted_text, obligation.context, documentId),
          analyzeStakeholders(obligation.extracted_text, obligation.context, documentId),
          analyzeImplementation(obligation.extracted_text, obligation.context, documentId),
        ]);

        return {
          ...obligation,
          obligation_type: classification.obligation_type,
          confidence: classification.confidence,
          stakeholders: stakeholders.stakeholders,
          impacted_systems: stakeholders.impacted_systems,
          implementation_type: implementation.implementation_type,
          estimated_effort: implementation.estimated_effort,
          deadline: implementation.deadline,
          classification_reasoning: classification.reasoning,
          stakeholder_reasoning: stakeholders.reasoning,
          implementation_reasoning: implementation.reasoning,
        };
      })
    );

    classified.push(...batchResults);

    // Small delay between batches to respect rate limits
    if (i + 3 < obligations.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return classified;
}
