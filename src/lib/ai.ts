import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function callClaude(
  prompt: string,
  pdfBase64?: string,
  maxTokens: number = 16000
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const content: any[] = [];

  if (pdfBase64) {
    content.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: pdfBase64,
      },
    });
  }

  content.push({ type: 'text', text: prompt });

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// Attempt to repair truncated JSON arrays
export function repairJsonArray(text: string): string {
  let clean = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  
  // If it already parses, return as-is
  try { JSON.parse(clean); return clean; } catch {}

  // Try closing truncated array objects
  // Find last complete object in array
  const lastCompleteObj = clean.lastIndexOf('},');
  if (lastCompleteObj > 0) {
    const repaired = clean.substring(0, lastCompleteObj + 1) + ']';
    try { JSON.parse(repaired); return repaired; } catch {}
  }

  // Try closing with just }]
  const lastOpenBrace = clean.lastIndexOf('{');
  const lastCloseBrace = clean.lastIndexOf('}');
  if (lastCloseBrace > lastOpenBrace && lastCloseBrace > 0) {
    const repaired = clean.substring(0, lastCloseBrace + 1) + ']';
    try { JSON.parse(repaired); return repaired; } catch {}
  }

  // Last resort: find all complete objects
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '{') { if (depth === 0) start = i; depth++; }
    if (clean[i] === '}') { depth--; if (depth === 0 && start >= 0) { objects.push(clean.substring(start, i + 1)); start = -1; } }
  }
  if (objects.length > 0) {
    return '[' + objects.join(',') + ']';
  }

  return clean;
}

export function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * 1.00;
  const outputCost = (outputTokens / 1_000_000) * 5.00;
  return inputCost + outputCost;
}

export { anthropic };
