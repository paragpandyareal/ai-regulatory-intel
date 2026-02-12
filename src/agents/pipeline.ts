import { parseDocument } from './document-parser';
import { extractObligations } from './obligation-extractor';
import { classifyObligations } from './obligation-classifier';
import { supabaseAdmin } from '@/lib/supabase';

export async function processPipeline(
  documentId: string,
  pdfBase64: string
): Promise<{ cost: number }> {
  console.log(`[Pipeline] Starting processing for document ${documentId}`);
  
  let totalCost = 0;

  // STAGE 1: Parse document structure
  console.log(`[Pipeline] Stage 1: Parsing document ${documentId}`);
  
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('title')
    .eq('id', documentId)
    .single();

  const parsed = await parseDocument(documentId, pdfBase64, doc?.title || 'Untitled Document');
  totalCost += parsed.cost;

  // Update document metadata from parsing
  await supabaseAdmin
    .from('documents')
    .update({ section_count: parsed.sections.length })
    .eq('id', documentId);

  // STAGE 2: Extract obligations (sections first, then documentId)
  console.log(`[Pipeline] Stage 2: Extracting obligations from ${parsed.sections.length} sections`);
  const obligations = await extractObligations(parsed.sections, documentId);
  
  // Calculate extraction cost (extractObligations returns obligations array, not cost object)
  // Cost is logged internally, so we'll estimate it
  const extractionCost = obligations.length * 0.001; // Rough estimate
  totalCost += extractionCost;

  console.log(`[Pipeline] Extracted ${obligations.length} obligations`);

  // STAGE 3: Classify obligations
  console.log(`[Pipeline] Stage 3: Classifying ${obligations.length} obligations`);
  
  // Fetch stored obligations to get their IDs
  const { data: storedObligations } = await supabaseAdmin
    .from('obligations')
    .select('*')
    .eq('document_id', documentId);
  
  if (storedObligations && storedObligations.length > 0) {
    const classificationCost = await classifyObligations(documentId, storedObligations);
    totalCost += classificationCost;
  }

  console.log(`[Pipeline] Processing complete. Total cost: $${totalCost.toFixed(4)}`);

  return { cost: totalCost };
}
