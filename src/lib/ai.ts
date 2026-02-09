import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function callClaude(
  prompt: string,
  pdfBase64?: string
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

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
    max_tokens: 8192,
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

export function calculateCost(inputTokens: number, outputTokens: number): number {
  // Claude Haiku 4.5 pricing
  const inputCost = (inputTokens / 1_000_000) * 1.00;
  const outputCost = (outputTokens / 1_000_000) * 5.00;
  return inputCost + outputCost;
}

export { anthropic };
