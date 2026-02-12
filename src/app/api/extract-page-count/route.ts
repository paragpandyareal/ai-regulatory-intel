import { NextRequest, NextResponse } from 'next/server';
import { callClaudeWithRetry } from '@/lib/ai';

export async function POST(request: NextRequest) {
  try {
    const { pdfBase64 } = await request.json();

    if (!pdfBase64) {
      return NextResponse.json({ error: 'Missing PDF data' }, { status: 400 });
    }

    // Use Claude to count pages from PDF
    const response = await callClaudeWithRetry(
      'Count the total number of pages in this PDF document. Respond with ONLY a number, nothing else.',
      pdfBase64,
      100
    );

    const pageCount = parseInt(response.text.trim()) || 0;

    return NextResponse.json({ 
      pageCount,
      cost: response.inputTokens * 0.000003 + response.outputTokens * 0.000015
    });

  } catch (error: any) {
    console.error('[Extract Page Count] Error:', error.message);
    return NextResponse.json({ pageCount: 0, error: error.message }, { status: 500 });
  }
}
