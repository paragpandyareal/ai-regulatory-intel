import { callClaude, calculateCost } from '@/lib/ai';
import { logCost } from './document-parser';

async function classifyObligation(text: string, context: string, documentId: string) {
  const startTime = Date.now();
  const response = await callClaude(
    `Classify this Australian energy regulatory obligation.

OBLIGATION: "${text}"
CONTEXT: "${context}"

RESPOND WITH ONLY VALID JSON:
{"obligation_type":"binding|guidance|definition|example","confidence":0.0-1.0,"reasoning":"brief explanation"}

Rules: "binding"=must/shall/required to, "guidance"=should/may/recommended, "definition"=means/refers to, "example"=illustrative.
Confidence: 0.95-1.0=clear must/shall, 0.85-0.94=strong, 0.70-0.84=probable, 0.50-0.69=ambiguous.`
  );
  const cost = calculateCost(response.inputTokens, response.outputTokens);
  await logCost(documentId, 'classification', 'claude-haiku-4.5', response.inputTokens, response.outputTokens, cost, false, Date.now() - startTime);
  try {
    const clean = response.text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(clean);
  } catch {
    return { obligation_type: 'guidance', confidence: 0.5, reasoning: 'Parse failed' };
  }
}

async function analyzeStakeholders(text: string, context: string, documentId: string) {
  const startTime = Date.now();
  const response = await callClaude(
    `Identify stakeholders and impacted systems for this Australian energy obligation.

OBLIGATION: "${text}"
CONTEXT: "${context}"

RESPOND WITH ONLY VALID JSON:
{"stakeholders":["list"],"impacted_systems":["list"],"reasoning":"brief explanation"}

Known stakeholders: Retailer, DNSP, TNSP, AEMO, AEMC, AER, Metering Provider, Metering Data Provider, Metering Coordinator, Customer, Generator.
Known systems: Billing, MSATS, B2B, CRM, Metering, MDM, Market Systems, Settlements, Customer Portal, CATS.`
  );
  const cost = calculateCost(response.inputTokens, response.outputTokens);
  await logCost(documentId, 'classification', 'claude-haiku-4.5', response.inputTokens, response.outputTokens, cost, false, Date.now() - startTime);
  try {
    const clean = response.text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(clean);
  } catch {
    return { stakeholders: [], impacted_systems: [], reasoning: 'Parse failed' };
  }
}

async function analyzeImplementation(text: string, context: string, documentId: string) {
  const startTime = Date.now();
  const response = await callClaude(
    `Assess implementation requirements for this Australian energy obligation.

OBLIGATION: "${text}"
CONTEXT: "${context}"

RESPOND WITH ONLY VALID JSON:
{"implementation_type":"system_change|process_change|both|no_change","estimated_effort":"trivial|small|medium|large","deadline":null,"reasoning":"brief explanation"}

system_change=IT modifications, process_change=business process updates, both=both, no_change=informational.
trivial=<1day, small=1-5days, medium=1-4weeks, large=1+months.`
  );
  const cost = calculateCost(response.inputTokens, response.outputTokens);
  await logCost(documentId, 'classification', 'claude-haiku-4.5', response.inputTokens, response.outputTokens, cost, false, Date.now() - startTime);
  try {
    const clean = response.text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(clean);
  } catch {
    return { implementation_type: 'no_change', estimated_effort: 'small', deadline: null, reasoning: 'Parse failed' };
  }
}

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
) {
  const classified = [];

  for (let i = 0; i < obligations.length; i += 3) {
    const batch = obligations.slice(i, i + 3);

    const batchResults = await Promise.all(
      batch.map(async (ob) => {
        const [classification, stakeholders, implementation] = await Promise.all([
          classifyObligation(ob.extracted_text, ob.context, documentId),
          analyzeStakeholders(ob.extracted_text, ob.context, documentId),
          analyzeImplementation(ob.extracted_text, ob.context, documentId),
        ]);

        return {
          ...ob,
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

    if (i + 3 < obligations.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return classified;
}
