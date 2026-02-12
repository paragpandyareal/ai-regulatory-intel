import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'recent';

    let query = supabaseAdmin
      .from('documents')
      .select('id, title, source, document_type, uploaded_at, processed_at, obligation_count, processing_cost, auto_generated_title, extraction_status')
      .eq('is_archived', true);

    if (search) {
      query = query.or(`title.ilike.%${search}%,source.ilike.%${search}%,document_type.ilike.%${search}%`);
    }

    if (sortBy === 'recent') {
      query = query.order('processed_at', { ascending: false, nullsFirst: false })
                   .order('uploaded_at', { ascending: false });
    } else if (sortBy === 'complex') {
      query = query.order('obligation_count', { ascending: false, nullsFirst: false });
    } else if (sortBy === 'alphabetical') {
      query = query.order('title', { ascending: true });
    }

    const { data: documents, error } = await query;

    if (error) {
      console.error('[Archive API] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch archive' }, { status: 500 });
    }

    const stats = {
      totalDocuments: documents?.length || 0,
      totalObligations: documents?.reduce((sum, doc) => sum + (doc.obligation_count || 0), 0) || 0,
      totalCost: documents?.reduce((sum, doc) => sum + (doc.processing_cost || 0), 0) || 0,
    };

    return NextResponse.json({ 
      documents: documents || [],
      stats 
    });

  } catch (error: any) {
    console.error('[Archive API] Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch archive' }, { status: 500 });
  }
}
