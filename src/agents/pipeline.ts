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

  try {
    // Update status to processing
    await supabaseAdmin
      .from('documents')
      .update({ extraction_status: 'processing' })
      .eq('id', documentId);

    // STAGE 1: Parse document structure
    console.log(`[Pipeline] Stage 1: Parsing document ${documentId}`);
    
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('title')
      .eq('id', documentId)
      .single();

    const parsed = await parseDocument(documentId, pdfBase64, doc?.title || 'Untitled Document');
    totalCost += parsed.cost;

    await supabaseAdmin
      .from('documents')
      .update({ section_count: parsed.sections.length })
      .eq('id', documentId);

    // STAGE 2: Extract obligations
    console.log(`[Pipeline] Stage 2: Extracting obligations from ${parsed.sections.length} sections`);
    const obligations = await extractObligations(parsed.sections, documentId);
    totalCost += obligations.length * 0.001;
    console.log(`[Pipeline] Extracted ${obligations.length} obligations`);

    // STAGE 3: Classify obligations
    console.log(`[Pipeline] Stage 3: Classifying ${obligations.length} obligations`);
    
    const { data: storedObligations } = await supabaseAdmin
      .from('obligations')
      .select('*')
      .eq('document_id', documentId);
    
    if (storedObligations && storedObligations.length > 0) {
      const classificationCost = await classifyObligations(documentId, storedObligations);
      totalCost += classificationCost;
    }

    // STAGE 4: Calculate actual cost from cost_log
    const { data: costs } = await supabaseAdmin
      .from('cost_log')
      .select('cost')
      .eq('document_id', documentId)
      .eq('cache_hit', false);

    const actualCost = costs?.reduce((sum, c) => sum + Number(c.cost), 0) || totalCost;

    // Get actual obligation count
    const { count: obligationCount } = await supabaseAdmin
      .from('obligations')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId);

    // Update document with final stats
    await supabaseAdmin
      .from('documents')
      .update({
        extraction_status: 'completed',
        total_obligations: obligationCount || 0,
        obligation_count: obligationCount || 0,
        processing_cost: actualCost,
        processed_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    console.log(`[Pipeline] Complete! ${obligationCount} obligations, cost: $${actualCost.toFixed(4)}`);
    return { cost: actualCost };

  } catch (error: any) {
    console.error(`[Pipeline] Failed for document ${documentId}:`, error.message || error);

    // Still update with whatever obligations were saved before the error
    const { count: partialCount } = await supabaseAdmin
      .from('obligations')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId);

    const { data: partialCosts } = await supabaseAdmin
      .from('cost_log')
      .select('cost')
      .eq('document_id', documentId)
      .eq('cache_hit', false);

    const partialCost = partialCosts?.reduce((sum, c) => sum + Number(c.cost), 0) || 0;

    await supabaseAdmin
      .from('documents')
      .update({
        extraction_status: partialCount && partialCount > 0 ? 'completed' : 'failed',
        total_obligations: partialCount || 0,
        obligation_count: partialCount || 0,
        processing_cost: partialCost,
        processed_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    console.log(`[Pipeline] Partial save: ${partialCount || 0} obligations, cost: $${partialCost.toFixed(4)}`);
    throw error;
  }
}
