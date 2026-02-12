import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const source = formData.get('source') as string || 'AEMO';
    const documentType = formData.get('documentType') as string || 'Procedure';
    const pageCount = formData.get('pageCount') as string; // Will be sent from frontend

    if (!file || !(file.name.toLowerCase().endsWith('.pdf'))) {
      return NextResponse.json({ error: 'Please upload a PDF file' }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 50MB' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const pdfBase64 = buffer.toString('base64');

    // Check for duplicate
    const { data: existing } = await supabaseAdmin
      .from('documents')
      .select('id, title, extraction_status, page_count')
      .eq('file_hash', fileHash)
      .single();

    if (existing) {
      return NextResponse.json({
        message: 'Document already uploaded',
        document: existing,
        duplicate: true,
      }, { status: 200 });
    }

    // Create document record
    const { data: document, error } = await supabaseAdmin
      .from('documents')
      .insert({
        title: title || file.name.replace('.pdf', ''),
        source,
        document_type: documentType,
        file_hash: fileHash,
        file_url: `hash:${fileHash}`,
        extraction_status: 'pending',
        page_count: pageCount ? parseInt(pageCount) : 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', JSON.stringify(error));
      return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Document uploaded successfully',
      document,
      pdfBase64,
      duplicate: false,
    }, { status: 201 });

  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed: ' + error.message }, { status: 500 });
  }
}
