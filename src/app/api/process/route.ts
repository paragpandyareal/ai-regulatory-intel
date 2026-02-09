import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { processDocument } from '@/agents/pipeline';

export const maxDuration = 300; // 5 min timeout for Vercel Pro (60s on free tier)

export async function POST(request: NextRequest) {
  try {
    const { documentId, pdfBase64 } = await request.json();

    if (!documentId || !pdfBase64) {
      return NextResponse.json(
        { error: 'documentId and pdfBase64 are required' },
        { status: 400 }
      );
    }

    // Verify document exists
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('id, extraction_status')
      .eq('id', documentId)
      .single();

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (doc.extraction_status === 'processing') {
      return NextResponse.json({ error: 'Document is already being processed' }, { status: 409 });
    }

    // Run the pipeline
    const result = await processDocument(documentId, pdfBase64);

    if (result.success) {
      return NextResponse.json({
        message: 'Processing complete',
        obligations: result.obligations,
        cost: result.cost,
      });
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

  } catch (error) {
    console.error('Process endpoint error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
