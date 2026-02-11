import { callClaudeWithRetry, calculateCost } from '@/lib/ai';
import { supabaseAdmin } from '@/lib/supabase';
import { logCost } from './document-parser';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, AlignmentType, HeadingLevel, TextRun, BorderStyle, ShadingType } from 'docx';

interface RTMGenerationResult {
  docxBuffer: Buffer;
  cost: number;
}

export async function generateRTM(
  documentId: string,
  obligations: any[]
): Promise<RTMGenerationResult> {
  const startTime = Date.now();
  
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (!doc) throw new Error('Document not found');

  const obligationsContext = obligations.map((ob, idx) => 
    `[${idx + 1}] Section ${ob.section_number}: ${ob.extracted_text} (Type: ${ob.obligation_type}, Confidence: ${ob.confidence})`
  ).join('\n');

  const prompt = `You are generating a Requirement Traceability Matrix (RTM) for Australian energy market compliance.

SOURCE DOCUMENT: ${doc.title}
EFFECTIVE DATE: ${doc.effective_date || 'Not specified'}
DOCUMENT TYPE: ${doc.document_type || 'Regulatory Document'}
TOTAL OBLIGATIONS: ${obligations.length}

EXTRACTED OBLIGATIONS:
${obligationsContext}

Generate a complete RTM with ALL 4 TABS. Follow these rules strictly:

1. DERIVE information from the obligations - do NOT ask questions
2. Flag assumptions explicitly: [ASSUMED], [DERIVED], or [VERBATIM]
3. Always cite source section numbers
4. Generate complete tables - not just headers

RESPOND WITH ONLY VALID JSON in this format:

{
  "tab1_documentControl": {
    "initiativeName": "string [DERIVED from title]",
    "primaryDriver": "Regulatory",
    "primaryObjective": "string [DERIVED from obligations]",
    "scopeArea": "string [DERIVED - Market Layer/Core/CRM]",
    "impactedParties": ["Retailer", "etc"],
    "targetJurisdiction": "Australia (specify states if clear)",
    "commencementDate": "${doc.effective_date || '[ASSUMED - pending confirmation]'}",
    "version": "v1"
  },
  "tab2_interpretation": [
    {
      "reqId": "REQ-001",
      "regDocument": "${doc.title}",
      "regEffectiveDate": "${doc.effective_date || 'TBD'}",
      "regClause": "Section X.X",
      "verbatim": "Exact text from source",
      "summary": "Plain English summary",
      "appliesTo": "Who this affects",
      "appliesWhen": "Trigger condition",
      "inScope": true,
      "outOfScope": "What's excluded",
      "interpretationNotes": "[DERIVED/VERBATIM/ASSUMED] explanation"
    }
  ],
  "tab3_requirements": [
    {
      "busReqId": "BR-001",
      "linkedReqId": "REQ-001",
      "regEffectiveDate": "${doc.effective_date || 'TBD'}",
      "businessRequirement": "Outcome-based requirement",
      "systemRequirement": "Capability-based requirement",
      "defaultBehaviour": "How system should behave",
      "intendedOutcome": "What this achieves",
      "chargeableCapability": false
    }
  ],
  "tab4_assumptions": [
    {
      "radId": "RAD-001",
      "type": "ASSUMPTION | DEPENDENCY | RISK",
      "detail": "Specific assumption/dependency/risk",
      "impact": "Potential impact",
      "mitigation": "How to address",
      "owner": "Product Manager",
      "dueDate": "TBD",
      "status": "Open"
    }
  ]
}

CRITICAL: Generate AT LEAST 3-5 rows for each tab based on the ${obligations.length} obligations provided.
Map each BINDING obligation to requirements.
Flag interpretation risks in tab4.

RESPOND WITH ONLY THE JSON OBJECT.`;

  const response = await callClaudeWithRetry(prompt, undefined, 32000);
  const cost = calculateCost(response.inputTokens, response.outputTokens);
  await logCost(documentId, 'rtm_generation', 'claude-sonnet-4-20250514', response.inputTokens, response.outputTokens, cost, false, Date.now() - startTime);

  let rtmData: any;
  try {
    const cleaned = response.text.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '');
    rtmData = JSON.parse(cleaned);
  } catch (e) {
    console.error('[RTM Generator] JSON parse failed:', response.text.substring(0, 500));
    throw new Error('AI returned invalid JSON for RTM generation');
  }

  const doc1 = rtmData.tab1_documentControl;
  const doc2 = rtmData.tab2_interpretation || [];
  const doc3 = rtmData.tab3_requirements || [];
  const doc4 = rtmData.tab4_assumptions || [];

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
          text: 'REQUIREMENT TRACEABILITY MATRIX (RTM)',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        
        // TAB 1
        new Paragraph({
          text: 'TAB 1: DOCUMENT CONTROL',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
        }),
        createBetterTable(
          ['Item', 'Detail'],
          [
            ['Initiative Name', doc1.initiativeName || 'Not specified'],
            ['Primary Driver', doc1.primaryDriver || 'Regulatory'],
            ['Primary Objective', doc1.primaryObjective || 'Not specified'],
            ['Scope Area', doc1.scopeArea || 'Not specified'],
            ['Impacted Parties', Array.isArray(doc1.impactedParties) ? doc1.impactedParties.join(', ') : 'Not specified'],
            ['Target Jurisdiction', doc1.targetJurisdiction || 'Australia'],
            ['Commencement Date', doc1.commencementDate || 'TBD'],
            ['Version', doc1.version || 'v1'],
          ],
          [30, 70]
        ),
        
        // TAB 2
        new Paragraph({
          text: 'TAB 2: INTERPRETATION & SCOPE ASSESSMENT',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 600, after: 200 },
          pageBreakBefore: true,
        }),
        createBetterTable(
          ['Req ID', 'Reg Document', 'Effective Date', 'Clause', 'Verbatim', 'Summary', 'Applies To', 'Applies When', 'In Scope', 'Interpretation Notes'],
          doc2.map((r: any) => [
            r.reqId || '',
            r.regDocument || '',
            r.regEffectiveDate || '',
            r.regClause || '',
            r.verbatim || '',
            r.summary || '',
            r.appliesTo || '',
            r.appliesWhen || '',
            r.inScope ? '✔' : '✖',
            r.interpretationNotes || '',
          ]),
          [8, 12, 8, 8, 15, 15, 10, 10, 5, 9]
        ),
        
        // TAB 3
        new Paragraph({
          text: 'TAB 3: SYSTEM REQUIREMENTS (OUTCOME-FOCUSED)',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 600, after: 200 },
          pageBreakBefore: true,
        }),
        createBetterTable(
          ['Bus Req ID', 'Linked Req ID', 'Effective Date', 'Business Requirement', 'System Requirement', 'Default Behaviour', 'Intended Outcome', 'Chargeable?'],
          doc3.map((r: any) => [
            r.busReqId || '',
            r.linkedReqId || '',
            r.regEffectiveDate || '',
            r.businessRequirement || '',
            r.systemRequirement || '',
            r.defaultBehaviour || '',
            r.intendedOutcome || '',
            r.chargeableCapability ? 'Yes' : 'No',
          ]),
          [10, 10, 10, 18, 18, 15, 14, 5]
        ),
        
        // TAB 4
        new Paragraph({
          text: 'TAB 4: ASSUMPTIONS, DEPENDENCIES & RISKS',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 600, after: 200 },
          pageBreakBefore: true,
        }),
        createBetterTable(
          ['RAD ID', 'Type', 'Detail', 'Impact', 'Mitigation', 'Owner', 'Due Date', 'Status'],
          doc4.map((r: any) => [
            r.radId || '',
            r.type || '',
            r.detail || '',
            r.impact || '',
            r.mitigation || '',
            r.owner || '',
            r.dueDate || '',
            r.status || '',
          ]),
          [8, 12, 22, 18, 18, 12, 5, 5]
        ),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(wordDoc);
  return { docxBuffer: buffer, cost };
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
