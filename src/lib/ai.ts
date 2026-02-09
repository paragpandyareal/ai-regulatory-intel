import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function callClaude(
  prompt: string,
  pdfBase64?: string,
  maxTokens: number = 16000,
  retries: number = 3
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

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
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
    } catch (error: any) {
      const isRateLimit = error?.status === 429;
      if (isRateLimit && attempt < retries) {
        // Parse retry-after header or use default
        const retryAfter = error?.headers?.get?.('retry-after');
        const waitSeconds = retryAfter ? parseInt(retryAfter) + 5 : 65 * (attempt + 1);
        console.log(`[AI] Rate limited. Waiting ${waitSeconds}s before retry ${attempt + 1}/${retries}`);
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      } else {
        throw error;
      }
    }
  }

  throw new Error('Max retries exceeded for AI call');
}

export function repairJsonArray(text: string): string {
  let clean = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  
  try { JSON.parse(clean); return clean; } catch {}

  const lastCompleteObj = clean.lastIndexOf('},');
  if (lastCompleteObj > 0) {
    const repaired = clean.substring(0, lastCompleteObj + 1) + ']';
    try { JSON.parse(repaired); return repaired; } catch {}
  }

  const lastCloseBrace = clean.lastIndexOf('}');
  if (lastCloseBrace > 0) {
    const repaired = clean.substring(0, lastCloseBrace + 1) + ']';
    try { JSON.parse(repaired); return repaired; } catch {}
  }

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

export function repairJsonObject(text: string): string {
  let clean = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  try { JSON.parse(clean); return clean; } catch {}
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) {
    try { JSON.parse(match[0]); return match[0]; } catch {}
  }
  return clean;
}

export function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * 1.00;
  const outputCost = (outputTokens / 1_000_000) * 5.00;
  return inputCost + outputCost;
}

export { anthropic };
