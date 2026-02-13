import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    // Get documents that are archived and have obligations (regardless of extraction_status)
    const { data: documents, error } = await supabaseAdmin
      .from('documents')
      .select('id, obligation_count, page_count, processing_cost')
      .eq('is_archived', true)
      .gt('obligation_count', 0);

    if (error) {
      console.error('[Platform Stats] Error:', error);
      return NextResponse.json({ 
        documentCount: 0, 
        totalObligations: 0,
        pageCount: 0,
        hoursSaved: 0,
        totalCost: 0
      });
    }

    const documentCount = documents?.length || 0;
    const totalObligations = documents?.reduce((sum, doc) => sum + (doc.obligation_count || 0), 0) || 0;
    
    // Use real page counts where available, estimate for old documents
    const totalPages = documents?.reduce((sum, doc) => {
      if (doc.page_count && doc.page_count > 0) {
        return sum + doc.page_count;
      }
      // Fallback: estimate ~25 obligations per page for old documents
      return sum + Math.round((doc.obligation_count || 0) / 25);
    }, 0) || 0;
    
    // Calculate hours saved: Manual analysis = 4 pages/hour for regulatory docs (15 min per page)
    const hoursSaved = Math.round(totalPages / 4);

    // Calculate total processing cost
    const totalCost = documents?.reduce((sum, doc) => sum + (doc.processing_cost || 0), 0) || 0;

    return NextResponse.json({ 
      documentCount,
      totalObligations,
      pageCount: totalPages,
      hoursSaved,
      totalCost
    });

  } catch (error: any) {
    console.error('[Platform Stats] Error:', error.message);
    return NextResponse.json({ 
      documentCount: 0, 
      totalObligations: 0,
      pageCount: 0,
      hoursSaved: 0,
      totalCost: 0
    });
  }
}
