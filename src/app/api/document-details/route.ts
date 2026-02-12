import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
    }

    const { data: document, error } = await supabaseAdmin
      .from('documents')
      .select('id, title, source, document_type, uploaded_at, processed_at, obligation_count, processing_cost, auto_generated_title, extraction_status')
      .eq('id', documentId)
      .single();

    if (error) {
      console.error('[Document Details] Error:', error);
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json(document);

  } catch (error: any) {
    console.error('[Document Details] Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch document details' }, { status: 500 });
  }
}
