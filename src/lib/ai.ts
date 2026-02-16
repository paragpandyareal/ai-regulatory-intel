import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  timeout: 10 * 60 * 1000,
});

export async function callClaude(
  prompt: string,
  pdfBase64?: string,
  maxTokens: number = 16000,
  model: string = 'claude-haiku-4-5-20251001',
  jsonMode: 'array' | 'object' | 'none' = 'none'
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

  const messages: any[] = [{ role: 'user', content }];

  // Prefill forces Claude to start with valid JSON
  if (jsonMode === 'array') {
    messages.push({ role: 'assistant', content: '[' });
  } else if (jsonMode === 'object') {
    messages.push({ role: 'assistant', content: '{' });
  }

  const stream = await anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    messages,
  });

  const response = await stream.finalMessage();

  let text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Re-add the prefill character
  if (jsonMode === 'array') {
    text = '[' + text;
  } else if (jsonMode === 'object') {
    text = '{' + text;
  }

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

export async function callClaudeWithRetry(
  prompt: string,
  pdfBase64?: string,
  maxTokens: number = 16000,
  maxRetries: number = 3,
  model: string = 'claude-haiku-4-5-20251001',
  jsonMode: 'array' | 'object' | 'none' = 'none'
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callClaude(prompt, pdfBase64, maxTokens, model, jsonMode);
    } catch (error: any) {
      const isRateLimit = error?.status === 429;
      if (isRateLimit && attempt < maxRetries) {
        const waitSeconds = 65 * (attempt + 1);
        console.log(`[AI] Rate limited. Waiting ${waitSeconds}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

export function repairJson(text: string): string {
  let clean = text.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Already valid
  try { JSON.parse(clean); return clean; } catch {}

  // Remove trailing commas before } or ]
  clean = clean.replace(/,\s*([}\]])/g, '$1');
  try { JSON.parse(clean); return clean; } catch {}

  // Try extracting JSON object
  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) {
    const fixed = objMatch[0].replace(/,\s*([}\]])/g, '$1');
    try { JSON.parse(fixed); return fixed; } catch {}
  }

  // Try extracting JSON array
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    const fixed = arrMatch[0].replace(/,\s*([}\]])/g, '$1');
    try { JSON.parse(fixed); return fixed; } catch {}
  }

  // Truncated array — close at last complete object
  if (clean.startsWith('[') || clean.includes('[{')) {
    const start = clean.indexOf('[');
    const working = clean.substring(start);
    
    // Find last complete }, and close array
    const lastComplete = working.lastIndexOf('},');
    if (lastComplete > 0) {
      const repaired = working.substring(0, lastComplete + 1) + ']';
      try { JSON.parse(repaired); return repaired; } catch {}
    }
    
    // Find last } and close array
    const lastBrace = working.lastIndexOf('}');
    if (lastBrace > 0) {
      const repaired = working.substring(0, lastBrace + 1) + ']';
      try { JSON.parse(repaired); return repaired; } catch {}
    }
  }

  // Truncated object — progressively trim
  if (clean.startsWith('{')) {
    for (let i = clean.length - 1; i > 0; i--) {
      if (clean[i] === '}') {
        const attempt = clean.substring(0, i + 1);
        try { JSON.parse(attempt); return attempt; } catch {}
      }
    }
  }

  // Last resort: extract all individually valid objects
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '{') { if (depth === 0) start = i; depth++; }
    if (clean[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        const obj = clean.substring(start, i + 1);
        try { JSON.parse(obj); objects.push(obj); } catch {}
        start = -1;
      }
    }
  }
  if (objects.length > 0) return '[' + objects.join(',') + ']';

  return clean;
}

export function calculateCost(inputTokens: number, outputTokens: number, isOpus: boolean = false): number {
  if (isOpus) {
    const inputCost = (inputTokens / 1_000_000) * 15.00;
    const outputCost = (outputTokens / 1_000_000) * 75.00;
    return inputCost + outputCost;
  } else {
    const inputCost = (inputTokens / 1_000_000) * 1.00;
    const outputCost = (outputTokens / 1_000_000) * 5.00;
    return inputCost + outputCost;
  }
}

export { anthropic };
