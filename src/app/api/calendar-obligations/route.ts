import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    // Fetch ALL obligations with dates across ALL documents
    const { data: obligations, error } = await supabaseAdmin
      .from('obligations')
      .select(`
        id,
        commencement_date,
        extracted_text,
        obligation_type,
        document_id,
        documents (
          title
        )
      `)
      .not('commencement_date', 'is', null)
      .order('commencement_date', { ascending: true });

    if (error) {
      console.error('[Calendar API] Error fetching obligations:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch ALL documents with user-specified commencement dates
    const { data: documents, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, title, commencement_dates')
      .not('commencement_dates', 'eq', '[]');

    if (docError) {
      console.error('[Calendar API] Error fetching documents:', docError);
    }

    // Group obligations by date
    const dateMap = new Map<string, any[]>();

    // Add obligation-level dates
    obligations?.forEach((ob: any) => {
      const date = ob.commencement_date;
      if (!dateMap.has(date)) {
        dateMap.set(date, []);
      }
      dateMap.get(date)?.push({
        type: 'obligation',
        id: ob.id,
        commencement_date: ob.commencement_date,
        extracted_text: ob.extracted_text,
        obligation_type: ob.obligation_type,
        document_id: ob.document_id,
        document_title: ob.documents?.title || 'Unknown Document',
      });
    });

    // Add document-level dates
    documents?.forEach((doc: any) => {
      const dates = doc.commencement_dates || [];
      dates.forEach((d: any) => {
        if (!dateMap.has(d.date)) {
          dateMap.set(d.date, []);
        }
        dateMap.get(d.date)?.push({
          type: 'document',
          document_id: doc.id,
          document_title: doc.title,
          description: d.description,
          commencement_date: d.date,
        });
      });
    });

    // Convert to array and calculate counts
    const dateGroups = Array.from(dateMap.entries()).map(([date, items]) => {
      const obligations = items.filter(i => i.type === 'obligation');
      const documents = items.filter(i => i.type === 'document');
      
      return {
        date,
        obligations,
        documents,
        bindingCount: obligations.filter(o => o.obligation_type === 'binding').length,
        guidanceCount: obligations.filter(o => o.obligation_type === 'guidance').length,
        totalItems: items.length,
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      dateGroups,
      totalObligations: obligations?.length || 0,
      totalDocuments: documents?.length || 0,
      totalDates: dateGroups.length,
    });
  } catch (error: any) {
    console.error('[Calendar API] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
