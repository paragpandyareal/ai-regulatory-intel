import { NextRequest, NextResponse } from 'next/server';
import { generateRTM } from '@/agents/rtm-generator';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
    }

    const { data: obligations } = await supabaseAdmin
      .from('obligations')
      .select('*')
      .eq('document_id', documentId)
      .order('section_number');

    if (!obligations || obligations.length === 0) {
      return NextResponse.json({ error: 'No obligations found for this document' }, { status: 404 });
    }

    const result = await generateRTM(documentId, obligations);

    return new NextResponse(result.docxBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="RTM_Requirement_Traceability_Matrix.docx"',
        'X-Generation-Cost': result.cost.toFixed(6),
      },
    });
  } catch (error: any) {
    console.error('[Generate RTM API] Error:', error.message);
    return NextResponse.json({ error: error.message || 'RTM generation failed' }, { status: 500 });
  }
}
