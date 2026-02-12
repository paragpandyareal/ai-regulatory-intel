import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
    }

    // Get document details
    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .select('title, pdf_base64')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Check if already extracted
    const existing = await supabaseAdmin
      .from('documents')
      .select('commencement_dates')
      .eq('id', documentId)
      .single();

    if (existing.data?.commencement_dates && existing.data.commencement_dates.length > 0) {
      return NextResponse.json({ dates: existing.data.commencement_dates });
    }

    console.log('[Extract Dates] Analyzing document for commencement dates...');

    const prompt = `You are analyzing a regulatory document titled "${doc.title}".

Extract ALL commencement dates (when rules/regulations START to apply) from this document.

CRITICAL RULES:
✅ EXTRACT: "This rule takes effect on 1 July 2026" → Extract this
✅ EXTRACT: "Phase 1 commences 1 Feb 2026, Phase 2 commences 1 July 2026" → Extract both
✅ EXTRACT: "Retailers must comply from 1 July 2026" → Extract this

❌ IGNORE: "Published on 12 Sep 2025" (publication date)
❌ IGNORE: "Revoked on X date" (ending of old rules)
❌ IGNORE: "Before 1 July 2020" (historical dates)
❌ IGNORE: "Contracts starting before..." (example dates)

For EACH commencement date found, provide:
1. date: "YYYY-MM-DD"
2. description: Brief description of what commences on this date

Return JSON:
{
  "dates": [
    {
      "date": "2026-07-01",
      "description": "Main rule commencement"
    },
    {
      "date": "2027-01-01", 
      "description": "Phase 2 implementation"
    }
  ]
}

If NO commencement dates found, return: {"dates": []}

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: doc.pdf_base64,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const text = content.text.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '');

    const parsed = JSON.parse(text);
    const extractedDates = parsed.dates || [];

    console.log(`[Extract Dates] Found ${extractedDates.length} commencement dates`);

    // Save to database
    await supabaseAdmin
      .from('documents')
      .update({ commencement_dates: extractedDates })
      .eq('id', documentId);

    return NextResponse.json({ dates: extractedDates });
  } catch (error: any) {
    console.error('[Extract Dates API] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
