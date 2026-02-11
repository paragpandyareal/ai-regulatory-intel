import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
    }

    // Clear all caches related to this document
    await supabaseAdmin
      .from('processing_cache')
      .delete()
      .or(`cache_key.eq.parse_${documentId},cache_key.like.extract_${documentId}%,cache_key.eq.docgen_rtm_${documentId},cache_key.eq.docgen_funcspec_${documentId}`);

    // Delete existing obligations
    await supabaseAdmin
      .from('obligations')
      .delete()
      .eq('document_id', documentId);

    console.log(`[Clear Cache] Cleared cache and obligations for document ${documentId}`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Clear Cache API] Error:', error.message);
    return NextResponse.json({ error: error.message || 'Cache clearing failed' }, { status: 500 });
  }
}
