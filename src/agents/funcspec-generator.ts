import { callClaudeWithRetry, calculateCost } from '@/lib/ai';
import { supabaseAdmin } from '@/lib/supabase';
import { logCost } from './document-parser';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, HeadingLevel, TextRun, AlignmentType, BorderStyle, ShadingType } from 'docx';

interface FuncSpecResult {
  docxBuffer: Buffer;
  cost: number;
}

export async function generateFunctionalSpec(
  documentId: string,
  obligations: any[]
): Promise<FuncSpecResult> {
  const startTime = Date.now();
  
  // Check cache first
  const cacheKey = `docgen_funcspec_${documentId}`;
  const { data: cached } = await supabaseAdmin
    .from('processing_cache')
    .select('output, id, hit_count')
    .eq('cache_key', cacheKey)
    .single();

  if (cached?.output) {
    console.log('[FuncSpec Generator] Cache hit - using cached JSON data');
    await supabaseAdmin
      .from('processing_cache')
      .update({ hit_count: cached.hit_count + 1 })
      .eq('id', cached.id);
    
    await logCost(documentId, 'funcspec_generation', 'cache', 0, 0, 0, true, Date.now() - startTime);
    
    // Regenerate document from cached JSON (fast, no API cost)
    const { data: doc } = await supabaseAdmin.from('documents').select('*').eq('id', documentId).single();
    const buffer = await createFuncSpecDocument(cached.output, doc);
    return { docxBuffer: buffer, cost: 0 };
  }

  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (!doc) throw new Error('Document not found');

  const bindingObs = obligations.filter(o => o.obligation_type === 'binding');
  const obligationsContext = obligations.map((ob, idx) => 
    `[${idx + 1}] Section ${ob.section_number} (Page ${ob.page_number}): ${ob.extracted_text}`
  ).join('\n\n');

  const prompt = `You are generating a Functional Specification for Australian energy market regulatory compliance.

SOURCE DOCUMENT: ${doc.title}
EFFECTIVE DATE: ${doc.effective_date || 'Not specified'}
TOTAL OBLIGATIONS: ${obligations.length} (${bindingObs.length} binding)

EXTRACTED OBLIGATIONS:
${obligationsContext}

Generate a COMPLETE Functional Specification. RESPOND WITH ONLY VALID JSON:

{
  "initiativeOverview": {
    "regulatoryDriver": "${doc.title}",
    "effectiveDate": "${doc.effective_date || '[ASSUMED - pending confirmation]'}",
    "impactedParticipants": ["Retailer", "etc - DERIVED from obligations"],
    "complianceRisk": "Risk if not delivered - DERIVED"
  },
  "regulatorySourceRegister": [
    {
      "source": "${doc.title}",
      "clause": "Section X.X",
      "obligationSummary": "Summary of obligation",
      "confidence": "High | Medium | Low"
    }
  ],
  "problemStatement": {
    "currentState": "Description",
    "complianceExposure": "Risk description",
    "operationalRisk": "Impact description"
  },
  "functionalScope": {
    "inScope": ["Item 1", "Item 2"],
    "outOfScope": ["Item 1", "Item 2"]
  },
  "functionalRequirements": [
    {
      "id": "FR-001",
      "requirement": "System MUST...",
      "classification": "VERBATIM | DERIVED | ASSUMED | UNCERTAIN",
      "source": "Section X.X",
      "notes": "Additional context"
    }
  ],
  "businessRules": [
    {
      "ruleId": "BR-001",
      "rule": "If condition then action",
      "source": "Section X.X",
      "classification": "VERBATIM | DERIVED"
    }
  ],
  "dataRequirements": [
    {
      "dataElement": "Element name",
      "mandatory": true,
      "source": "Section X.X",
      "notes": "Context"
    }
  ],
  "risksAndAmbiguities": [
    {
      "type": "Interpretation risk | Timing risk | etc",
      "description": "Specific risk",
      "impact": "Potential impact",
      "mitigation": "How to address"
    }
  ],
  "assumptions": [
    {
      "assumptionId": "ASMP-001",
      "assumption": "Assumption text",
      "impact": "Impact if wrong",
      "validationRequired": "How to validate"
    }
  ],
  "traceabilityStatement": "Confirmation that all requirements map to obligations",
  "implementationComplexity": {
    "level": "Low | Medium | High | Extreme",
    "reason": "1 line explanation"
  }
}

CRITICAL RULES:
- Generate AT LEAST 5 functional requirements from the ${bindingObs.length} binding obligations
- Flag ALL derivations with [DERIVED - reason]
- Quote source sections for VERBATIM content
- NO hallucination

RESPOND WITH ONLY THE JSON OBJECT.`;

  const response = await callClaudeWithRetry(prompt, undefined, 32000);
  const cost = calculateCost(response.inputTokens, response.outputTokens);
  await logCost(documentId, 'funcspec_generation', 'claude-sonnet-4-20250514', response.inputTokens, response.outputTokens, cost, false, Date.now() - startTime);

  let specData: any;
  try {
    const cleaned = response.text.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '');
    specData = JSON.parse(cleaned);
  } catch (e) {
    console.error('[FuncSpec Generator] JSON parse failed:', response.text.substring(0, 500));
    throw new Error('AI returned invalid JSON for Functional Spec generation');
  }

  // Cache using 'extraction' as operation type (allowed by DB constraint)
  const { error: cacheError } = await supabaseAdmin.from('processing_cache').insert({
    cache_key: cacheKey,
    operation: 'extraction', // Use allowed operation type
    input_hash: documentId,
    output: specData,
    model: 'claude-sonnet-4-20250514',
    tokens_used: response.inputTokens + response.outputTokens,
    cost,
  });

  if (cacheError) {
    console.error('[FuncSpec Generator] Cache insert error:', cacheError);
  } else {
    console.log('[FuncSpec Generator] Successfully cached document data');
  }

  const buffer = await createFuncSpecDocument(specData, doc);
  return { docxBuffer: buffer, cost };
}

async function createFuncSpecDocument(specData: any, doc: any): Promise<Buffer> {
  const wordDoc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,
            right: 1440,
            bottom: 1440,
            left: 1440,
          },
        },
      },
      children: [
        new Paragraph({
          text: 'FUNCTIONAL SPECIFICATION',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        new Paragraph({
          text: doc.title || 'Regulatory Compliance',
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        
        new Paragraph({ text: '1. INITIATIVE OVERVIEW', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
        new Paragraph({ 
          text: `Regulatory Driver: ${specData.initiativeOverview?.regulatoryDriver || 'Not specified'}`,
          spacing: { after: 120 }
        }),
        new Paragraph({ 
          text: `Effective Date: ${specData.initiativeOverview?.effectiveDate || 'TBD'}`,
          spacing: { after: 120 }
        }),
        new Paragraph({ 
          text: `Impacted Participants: ${specData.initiativeOverview?.impactedParticipants?.join(', ') || 'Not specified'}`,
          spacing: { after: 120 }
        }),
        new Paragraph({ 
          text: `Compliance Risk: ${specData.initiativeOverview?.complianceRisk || 'Not specified'}`,
          spacing: { after: 300 }
        }),
        
        new Paragraph({ text: '2. REGULATORY SOURCE REGISTER', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
        createBetterTable(
          ['Source', 'Clause', 'Obligation Summary', 'Confidence'],
          (specData.regulatorySourceRegister || []).map((r: any) => [
            r.source || '',
            r.clause || '',
            r.obligationSummary || '',
            r.confidence || '',
          ]),
          [20, 15, 50, 15]
        ),
        
        new Paragraph({ text: '3. PROBLEM STATEMENT', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
        new Paragraph({ 
          children: [
            new TextRun({ text: 'Current State: ', bold: true }),
            new TextRun(specData.problemStatement?.currentState || 'Not specified'),
          ],
          spacing: { after: 200 }
        }),
        new Paragraph({ 
          children: [
            new TextRun({ text: 'Compliance Exposure: ', bold: true }),
            new TextRun(specData.problemStatement?.complianceExposure || 'Not specified'),
          ],
          spacing: { after: 200 }
        }),
        new Paragraph({ 
          children: [
            new TextRun({ text: 'Operational Risk: ', bold: true }),
            new TextRun(specData.problemStatement?.operationalRisk || 'Not specified'),
          ],
          spacing: { after: 300 }
        }),
        
        new Paragraph({ text: '4. FUNCTIONAL SCOPE', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
        new Paragraph({ text: 'In Scope:', heading: HeadingLevel.HEADING_3, spacing: { after: 120 } }),
        ...(specData.functionalScope?.inScope || []).map((item: string) => 
          new Paragraph({ text: `• ${item}`, bullet: { level: 0 }, spacing: { after: 80 } })
        ),
        new Paragraph({ text: 'Out of Scope:', heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 120 } }),
        ...(specData.functionalScope?.outOfScope || []).map((item: string) => 
          new Paragraph({ text: `• ${item}`, bullet: { level: 0 }, spacing: { after: 80 } })
        ),
        new Paragraph({ text: '', spacing: { after: 200 } }),
        
        new Paragraph({ text: '5. FUNCTIONAL REQUIREMENTS', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
        createBetterTable(
          ['ID', 'Requirement', 'Classification', 'Source', 'Notes'],
          (specData.functionalRequirements || []).map((r: any) => [
            r.id || '',
            r.requirement || '',
            r.classification || '',
            r.source || '',
            r.notes || '',
          ]),
          [8, 42, 15, 15, 20]
        ),
        
        new Paragraph({ text: '6. BUSINESS RULES', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
        createBetterTable(
          ['Rule ID', 'Rule', 'Source', 'Classification'],
          (specData.businessRules || []).map((r: any) => [
            r.ruleId || '',
            r.rule || '',
            r.source || '',
            r.classification || '',
          ]),
          [12, 53, 20, 15]
        ),
        
        new Paragraph({ text: '7. DATA REQUIREMENTS', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
        createBetterTable(
          ['Data Element', 'Mandatory', 'Source', 'Notes'],
          (specData.dataRequirements || []).map((r: any) => [
            r.dataElement || '',
            r.mandatory ? 'Yes' : 'No',
            r.source || '',
            r.notes || '',
          ]),
          [25, 12, 18, 45]
        ),
        
        new Paragraph({ text: '8. RISKS & REGULATORY AMBIGUITIES', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
        ...(specData.risksAndAmbiguities || []).map((r: any) => 
          new Paragraph({ 
            text: `• ${r.type}: ${r.description}`,
            spacing: { after: 150 }
          })
        ),
        new Paragraph({ text: '', spacing: { after: 200 } }),
        
        new Paragraph({ text: '9. ASSUMPTIONS REGISTER', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
        createBetterTable(
          ['Assumption ID', 'Assumption', 'Impact', 'Validation Required'],
          (specData.assumptions || []).map((r: any) => [
            r.assumptionId || '',
            r.assumption || '',
            r.impact || '',
            r.validationRequired || '',
          ]),
          [15, 35, 25, 25]
        ),
        
        new Paragraph({ text: '10. TRACEABILITY STATEMENT', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
        new Paragraph({ 
          text: specData.traceabilityStatement || 'All functional requirements map back to regulatory obligations.',
          spacing: { after: 300 }
        }),
        
        new Paragraph({ text: '11. IMPLEMENTATION COMPLEXITY INDICATOR', heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
        new Paragraph({ 
          children: [
            new TextRun({ text: 'Complexity: ', bold: true }),
            new TextRun(specData.implementationComplexity?.level || 'Medium'),
          ],
          spacing: { after: 120 }
        }),
        new Paragraph({ 
          children: [
            new TextRun({ text: 'Reason: ', bold: true }),
            new TextRun(specData.implementationComplexity?.reason || 'Multiple system changes required'),
          ]
        }),
      ],
    }],
  });

  return await Packer.toBuffer(wordDoc);
}

function createBetterTable(headers: string[], rows: string[][], columnWidths: number[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        height: { value: 600, rule: 'atLeast' },
        children: headers.map((header, idx) => 
          new TableCell({
            width: { size: columnWidths[idx], type: WidthType.PERCENTAGE },
            children: [new Paragraph({
              children: [new TextRun({
                text: header,
                bold: true,
                size: 22,
              })],
              alignment: AlignmentType.CENTER,
            })],
            shading: { fill: '4472C4', type: ShadingType.SOLID },
            margins: {
              top: 100,
              bottom: 100,
              left: 100,
              right: 100,
            },
          })
        ),
      }),
      ...rows.map((row, rowIdx) => 
        new TableRow({
          height: { value: 400, rule: 'atLeast' },
          children: row.map((cell, cellIdx) => 
            new TableCell({
              width: { size: columnWidths[cellIdx], type: WidthType.PERCENTAGE },
              children: [new Paragraph({
                text: cell,
                spacing: { before: 80, after: 80 },
              })],
              shading: rowIdx % 2 === 0 ? { fill: 'F2F2F2' } : undefined,
              margins: {
                top: 100,
                bottom: 100,
                left: 100,
                right: 100,
              },
            })
          ),
        })
      ),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    },
  });
}
