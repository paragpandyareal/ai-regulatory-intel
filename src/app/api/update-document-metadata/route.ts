import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { documentId, auto_generated_title, processing_cost, obligation_count, processed_at, extraction_status } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
    }

    const updates: any = {};
    
    if (auto_generated_title !== undefined) updates.auto_generated_title = auto_generated_title;
    if (processing_cost !== undefined) updates.processing_cost = processing_cost;
    if (obligation_count !== undefined) updates.obligation_count = obligation_count;
    if (processed_at !== undefined) updates.processed_at = processed_at;
    if (extraction_status !== undefined) updates.extraction_status = extraction_status;

    const { error } = await supabaseAdmin
      .from('documents')
      .update(updates)
      .eq('id', documentId);

    if (error) {
      console.error('[Update Metadata] Error:', error);
      return NextResponse.json({ error: 'Failed to update metadata' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[Update Metadata] Error:', error.message);
    return NextResponse.json({ error: 'Failed to update metadata' }, { status: 500 });
  }
}
