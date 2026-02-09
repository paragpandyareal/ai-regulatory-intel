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

    if (!file || !file.name.endsWith('.pdf')) {
      return NextResponse.json({ error: 'Please upload a PDF file' }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 50MB' }, { status: 400 });
    }

    // Generate SHA-256 hash for deduplication
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Check for duplicate
    const { data: existing } = await supabaseAdmin
      .from('documents')
      .select('id, title, extraction_status')
      .eq('file_hash', fileHash)
      .single();

    if (existing) {
      return NextResponse.json({
        message: 'Document already uploaded',
        document: existing,
        duplicate: true,
      }, { status: 200 });
    }

    // Store PDF as base64 in a simple approach (swap to Vercel Blob later)
    const base64Pdf = buffer.toString('base64');

    // Create document record
    const { data: document, error } = await supabaseAdmin
      .from('documents')
      .insert({
        title: title || file.name.replace('.pdf', ''),
        source,
        document_type: documentType,
        file_hash: fileHash,
        file_url: `data:application/pdf;base64,${base64Pdf.substring(0, 50)}...`, // Store reference, not full base64
        extraction_status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Document uploaded successfully',
      document,
      duplicate: false,
    }, { status: 201 });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
