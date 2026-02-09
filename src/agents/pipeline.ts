import { supabaseAdmin } from '@/lib/supabase';
import { parseDocument } from './document-parser';
import { extractObligations } from './obligation-extractor';
import { classifyObligations } from './classification-agents';

export async function processDocument(documentId: string, pdfBase64: string) {
  try {
    // Update status to processing
    await supabaseAdmin
      .from('documents')
      .update({ extraction_status: 'processing' })
      .eq('id', documentId);

    // STAGE 1: Parse document structure
    console.log(`[Pipeline] Stage 1: Parsing document ${documentId}`);
    const parsed = await parseDocument(pdfBase64, documentId);

    // Update document metadata from parsing
    await supabaseAdmin
      .from('documents')
      .update({
        title: parsed.title || undefined,
        effective_date: parsed.effective_date,
        version: parsed.version,
      })
      .eq('id', documentId);

    // STAGE 2: Extract obligations from each section
    console.log(`[Pipeline] Stage 2: Extracting obligations from ${parsed.sections.length} sections`);
    const rawObligations = await extractObligations(parsed.sections, documentId);
    console.log(`[Pipeline] Found ${rawObligations.length} raw obligations`);

    if (rawObligations.length === 0) {
      await supabaseAdmin
        .from('documents')
        .update({
          extraction_status: 'completed',
          total_obligations: 0,
          processed_at: new Date().toISOString(),
        })
        .eq('id', documentId);
      return { success: true, obligations: 0 };
    }

    // STAGE 3: Classify with parallel agents
    console.log(`[Pipeline] Stage 3: Classifying ${rawObligations.length} obligations with 3 agents`);
    const classifiedObligations = await classifyObligations(rawObligations, documentId);

    // STAGE 4: Store obligations in Supabase
    console.log(`[Pipeline] Stage 4: Storing ${classifiedObligations.length} obligations`);
    const obligationRecords = classifiedObligations.map(ob => ({
      document_id: documentId,
      extracted_text: ob.extracted_text,
      context: ob.context,
      obligation_type: ob.obligation_type,
      confidence: ob.confidence,
      section_number: ob.section_number,
      page_number: ob.page_number,
      keywords: ob.keywords,
      stakeholders: ob.stakeholders,
      impacted_systems: ob.impacted_systems,
      implementation_type: ob.implementation_type,
      estimated_effort: ob.estimated_effort,
      deadline: ob.deadline,
      classification_reasoning: ob.classification_reasoning,
      stakeholder_reasoning: ob.stakeholder_reasoning,
      implementation_reasoning: ob.implementation_reasoning,
    }));

    // Insert in batches of 20
    for (let i = 0; i < obligationRecords.length; i += 20) {
      const batch = obligationRecords.slice(i, i + 20);
      const { error } = await supabaseAdmin.from('obligations').insert(batch);
      if (error) {
        console.error(`[Pipeline] Error inserting obligations batch:`, error);
      }
    }

    // Calculate total processing cost
    const { data: costs } = await supabaseAdmin
      .from('cost_log')
      .select('cost')
      .eq('document_id', documentId)
      .eq('cache_hit', false);

    const totalCost = costs?.reduce((sum, c) => sum + Number(c.cost), 0) || 0;

    // Update document as completed
    await supabaseAdmin
      .from('documents')
      .update({
        extraction_status: 'completed',
        total_obligations: classifiedObligations.length,
        processing_cost: totalCost,
        processed_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    console.log(`[Pipeline] Complete! ${classifiedObligations.length} obligations, cost: $${totalCost.toFixed(4)}`);

    return {
      success: true,
      obligations: classifiedObligations.length,
      cost: totalCost,
    };

  } catch (error) {
    console.error(`[Pipeline] Failed for document ${documentId}:`, error);

    await supabaseAdmin
      .from('documents')
      .update({ extraction_status: 'failed' })
      .eq('id', documentId);

    return { success: false, error: String(error) };
  }
}
