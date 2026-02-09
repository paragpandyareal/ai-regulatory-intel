import { NextRequest, NextResponse } from 'next/server';
import { processDocument } from '@/agents/pipeline';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { documentId, pdfBase64 } = await request.json();

    if (!documentId || !pdfBase64) {
      return NextResponse.json({ error: 'Missing documentId or pdfBase64' }, { status: 400 });
    }

    const result = await processDocument(documentId, pdfBase64);

    return NextResponse.json({
      message: 'Processing complete',
      obligations: result.obligationsCount,
      cost: result.totalCost,
    });
  } catch (error: any) {
    console.error('[Process API] Error:', error.message);
    return NextResponse.json({ error: error.message || 'Processing failed' }, { status: 500 });
  }
}
