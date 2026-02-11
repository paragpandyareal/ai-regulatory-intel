import { NextRequest, NextResponse } from 'next/server';
import { generateFunctionalSpec } from '@/agents/funcspec-generator';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { documentId, forceRegenerate = false } = await request.json();

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

    const result = await generateFunctionalSpec(documentId, obligations, forceRegenerate);

    return new NextResponse(result.docxBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="Functional_Specification.docx"',
        'X-Generation-Cost': result.cost.toFixed(6),
      },
    });
  } catch (error: any) {
    console.error('[Generate FuncSpec API] Error:', error.message);
    return NextResponse.json({ error: error.message || 'Functional specification generation failed' }, { status: 500 });
  }
}
