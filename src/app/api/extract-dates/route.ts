import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
    }

    // Get all obligations with commencement dates for this document
    const { data: obligations, error } = await supabaseAdmin
      .from('obligations')
      .select('commencement_date, commencement_date_text, extracted_text')
      .eq('document_id', documentId)
      .not('commencement_date', 'is', null)
      .order('commencement_date', { ascending: true });

    if (error) {
      console.error('[Extract Dates] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by unique dates and create descriptions
    const dateMap = new Map<string, string[]>();
    
    obligations?.forEach(ob => {
      const date = ob.commencement_date;
      if (!dateMap.has(date)) {
        dateMap.set(date, []);
      }
      // Use the extracted obligation text as description hint
      const textSnippet = ob.commencement_date_text || ob.extracted_text?.substring(0, 80);
      if (textSnippet) {
        dateMap.get(date)?.push(textSnippet);
      }
    });

    // Convert to array format
    const dates = Array.from(dateMap.entries()).map(([date, descriptions]) => ({
      date,
      description: descriptions[0] || `Commencement: ${date}`,
    }));

    return NextResponse.json({ 
      dates,
      totalFound: dates.length 
    });

  } catch (error: any) {
    console.error('[Extract Dates] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
