import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { documentId, dates } = await request.json();

    if (!documentId || !Array.isArray(dates)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Validate date format
    for (const d of dates) {
      if (!d.date || !d.description) {
        return NextResponse.json({ error: 'Each date must have date and description' }, { status: 400 });
      }
      // Validate YYYY-MM-DD format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
        return NextResponse.json({ error: 'Date must be in YYYY-MM-DD format' }, { status: 400 });
      }
    }

    const { error } = await supabaseAdmin
      .from('documents')
      .update({ commencement_dates: dates })
      .eq('id', documentId);

    if (error) {
      console.error('[Document Dates API] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Document Dates API] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('commencement_dates')
      .eq('id', documentId)
      .single();

    if (error) {
      console.error('[Document Dates API] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ dates: data?.commencement_dates || [] });
  } catch (error: any) {
    console.error('[Document Dates API] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
