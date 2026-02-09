import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const documentId = request.nextUrl.searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    const { data: obligations, error } = await supabaseAdmin
      .from('obligations')
      .select('*')
      .eq('document_id', documentId)
      .order('section_number', { ascending: true })
      .order('confidence', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ obligations });

  } catch (error) {
    console.error('Obligations fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch obligations' }, { status: 500 });
  }
}
