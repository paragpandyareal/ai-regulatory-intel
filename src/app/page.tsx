'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, Clock, Zap, DollarSign, FileSpreadsheet, ScrollText, RefreshCw } from 'lucide-react';

interface Obligation {
  id: string;
  extracted_text: string;
  obligation_type: string;
  confidence: number;
  stakeholders: string[];
  impacted_systems: string[];
  implementation_type: string;
  estimated_effort: string;
  section_number: string;
  classification_reasoning: string;
}

type ProcessingStage = 'idle' | 'uploading' | 'parsing' | 'extracting' | 'classifying' | 'complete' | 'error';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<ProcessingStage>('idle');
  const [progress, setProgress] = useState(0);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processingCost, setProcessingCost] = useState<number>(0);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [generatingRTM, setGeneratingRTM] = useState(false);
  const [generatingFuncSpec, setGeneratingFuncSpec] = useState(false);
  const [rtmCost, setRtmCost] = useState<number | null>(null);
  const [funcSpecCost, setFuncSpecCost] = useState<number | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && (selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf'))) {
      setFile(selected);
      setError(null);
      setStage('idle');
      setObligations([]);
      setRtmCost(null);
      setFuncSpecCost(null);
    } else if (selected) {
      setError('Please select a PDF file');
    }
  };

  const handleUpload = async (forceReprocess = false) => {
    if (!file) return;

    try {
      setError(null);
      setObligations([]);
      setStage('uploading');
      setProgress(10);
      setRtmCost(null);
      setFuncSpecCost(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace('.pdf', ''));
      formData.append('source', 'AEMO');
      formData.append('documentType', 'Procedure');

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) throw new Error(uploadData.error);

      setDocumentId(uploadData.document.id);

      // If forcing reprocess, clear cache first
      if (forceReprocess && uploadData.document.id) {
        await fetch('/api/clear-cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: uploadData.document.id }),
        });
      }

      if (uploadData.duplicate && !forceReprocess) {
        setStage('complete');
        setProgress(100);
        await fetchObligations(uploadData.document.id);
        return;
      }

      setProgress(25);
      setStage('parsing');

      const processRes = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: uploadData.document.id,
          pdfBase64: uploadData.pdfBase64,
        }),
      });

      setProgress(80);
      setStage('classifying');

      const processData = await processRes.json();

      if (!processRes.ok) throw new Error(processData.error || 'Processing failed');

      setProcessingCost(processData.cost || 0);
      setProgress(100);
      setStage('complete');

      await fetchObligations(uploadData.document.id);

    } catch (err: any) {
      setError(err.message || 'Processing failed');
      setStage('error');
    }
  };

  const fetchObligations = async (docId: string) => {
    const res = await fetch(`/api/obligations?documentId=${docId}`);
    if (res.ok) {
      const data = await res.json();
      setObligations(data.obligations || []);
    }
  };

  const handleGenerateRTM = async (forceRegenerate = false) => {
    if (!documentId) return;
    
    try {
      setGeneratingRTM(true);
      const res = await fetch('/api/generate-rtm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, forceRegenerate }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      const cost = parseFloat(res.headers.get('X-Generation-Cost') || '0');
      setRtmCost(cost);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'RTM_Requirement_Traceability_Matrix.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err: any) {
      alert(`RTM generation failed: ${err.message}`);
    } finally {
      setGeneratingRTM(false);
    }
  };

  const handleGenerateFuncSpec = async (forceRegenerate = false) => {
    if (!documentId) return;
    
    try {
      setGeneratingFuncSpec(true);
      const res = await fetch('/api/generate-funcspec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, forceRegenerate }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      const cost = parseFloat(res.headers.get('X-Generation-Cost') || '0');
      setFuncSpecCost(cost);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Functional_Specification.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err: any) {
      alert(`Functional Spec generation failed: ${err.message}`);
    } finally {
      setGeneratingFuncSpec(false);
    }
  };

  const totalCost = processingCost + (rtmCost || 0) + (funcSpecCost || 0);

  const stageLabels: Record<ProcessingStage, string> = {
    idle: 'Ready to upload',
    uploading: 'Uploading PDF...',
    parsing: 'Stage 1: AI parsing document structure...',
    extracting: 'Stage 2: Extracting obligations...',
    classifying: 'Stage 3: Running 3 classification agents...',
    complete: 'Processing complete!',
    error: 'Processing failed',
  };

  const typeBadgeColor = (type: string) => {
    switch (type) {
      case 'binding': return 'bg-red-50 text-red-700 border-red-200';
      case 'guidance': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'definition': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'example': return 'bg-neutral-100 text-neutral-600 border-neutral-200';
      default: return 'bg-neutral-100 text-neutral-600 border-neutral-200';
    }
  };

  const effortBadgeColor = (effort: string) => {
    switch (effort) {
      case 'trivial': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'small': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'medium': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'large': return 'bg-rose-50 text-rose-700 border-rose-200';
      default: return 'bg-neutral-100 text-neutral-600 border-neutral-200';
    }
  };

  const confidenceColor = (c: number) => {
    if (c >= 0.9) return 'text-emerald-600';
    if (c >= 0.7) return 'text-amber-600';
    return 'text-rose-600';
  };

  return (
    <main className="min-h-screen bg-[#F5F7F5] p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-neutral-800">
            AI Regulatory Intelligence
          </h1>
          <p className="text-neutral-600">Upload an Australian energy regulation PDF to extract and classify obligations</p>
        </div>

        <Card className="border-neutral-200 shadow-sm rounded-3xl overflow-hidden bg-white">
          <CardHeader className="bg-gradient-to-r from-[#E8EDE8] to-[#EEF0EE] border-b border-neutral-200">
            <CardTitle className="flex items-center gap-2 text-neutral-800">
              <Upload className="h-5 w-5 text-[#7B9B7B]" />
              Upload Document
            </CardTitle>
            <CardDescription className="text-neutral-600">
              Supports AEMO, AEMC, AER, and ESB regulatory documents (PDF, max 50MB)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="block w-full text-sm text-neutral-600 file:mr-4 file:py-2.5 file:px-5 file:rounded-2xl file:border-0 file:text-sm file:font-medium file:bg-[#E8EDE8] file:text-[#5B7B5B] hover:file:bg-[#DFE7DF] transition-all"
                disabled={stage === 'uploading' || stage === 'parsing' || stage === 'extracting' || stage === 'classifying'}
              />
              <Button
                onClick={() => handleUpload(false)}
                disabled={!file || (stage !== 'idle' && stage !== 'complete' && stage !== 'error')}
                className="bg-[#7B9B7B] hover:bg-[#6B8B6B] text-white rounded-2xl px-6 shadow-sm"
              >
                {stage !== 'idle' && stage !== 'complete' && stage !== 'error' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Process
              </Button>
            </div>

            {stage !== 'idle' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-neutral-700">
                    {stage === 'complete' ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : stage === 'error' ? (
                      <AlertCircle className="h-4 w-4 text-rose-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-[#7B9B7B] animate-pulse" />
                    )}
                    {stageLabels[stage]}
                  </span>
                  {stage === 'complete' && (
                    <span className="flex items-center gap-1 text-emerald-600 font-medium">
                      <DollarSign className="h-3 w-3" />
                      ${processingCost.toFixed(4)} processing cost
                    </span>
                  )}
                </div>
                <Progress value={progress} className="h-2 bg-neutral-100" />
              </div>
            )}

            {error && (
              <p className="text-sm text-rose-600 flex items-center gap-1 bg-rose-50 p-3 rounded-2xl border border-rose-200">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}
          </CardContent>
        </Card>

        {stage === 'complete' && obligations.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-neutral-200 shadow-sm rounded-3xl hover:shadow-md transition-shadow bg-white">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-neutral-800">{obligations.length}</div>
                  <p className="text-sm text-neutral-600 mt-1">Total Obligations</p>
                </CardContent>
              </Card>
              <Card className="border-neutral-200 shadow-sm rounded-3xl hover:shadow-md transition-shadow bg-white">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-rose-600">
                    {obligations.filter(o => o.obligation_type === 'binding').length}
                  </div>
                  <p className="text-sm text-neutral-600 mt-1">Binding</p>
                </CardContent>
              </Card>
              <Card className="border-neutral-200 shadow-sm rounded-3xl hover:shadow-md transition-shadow bg-white">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-blue-600">
                    {obligations.filter(o => o.obligation_type === 'guidance').length}
                  </div>
                  <p className="text-sm text-neutral-600 mt-1">Guidance</p>
                </CardContent>
              </Card>
              <Card className="border-neutral-200 shadow-sm rounded-3xl hover:shadow-md transition-shadow bg-white">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-emerald-600">
                    ${totalCost.toFixed(4)}
                  </div>
                  <p className="text-sm text-neutral-600 mt-1">Total Cost</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-[#C5D5C5] shadow-sm rounded-3xl bg-gradient-to-br from-[#F0F5F0] to-[#F8FAF8]">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg text-neutral-800">Generate Compliance Documents</CardTitle>
                    <CardDescription className="text-neutral-600">
                      Convert extracted obligations into professional Word deliverables
                    </CardDescription>
                  </div>
                  <button
                    onClick={() => handleUpload(true)}
                    disabled={stage === 'uploading' || stage === 'parsing' || stage === 'extracting' || stage === 'classifying'}
                    className="text-[#7B9B7B] hover:text-[#6B8B6B] flex items-center gap-1 text-sm font-medium disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reprocess PDF
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Button
                      onClick={() => handleGenerateRTM(false)}
                      disabled={generatingRTM}
                      className="w-full bg-[#E8D4A0] hover:bg-[#DEC890] text-neutral-800 rounded-2xl shadow-sm font-medium"
                    >
                      {generatingRTM ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                      )}
                      Generate RTM
                    </Button>
                    {rtmCost !== null && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-emerald-600 font-medium">Generated! ${rtmCost.toFixed(4)}</span>
                        <button
                          onClick={() => handleGenerateRTM(true)}
                          disabled={generatingRTM}
                          className="text-[#7B9B7B] hover:text-[#6B8B6B] flex items-center gap-1 font-medium"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Regenerate
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Button
                      onClick={() => handleGenerateFuncSpec(false)}
                      disabled={generatingFuncSpec}
                      className="w-full bg-[#E8D4A0] hover:bg-[#DEC890] text-neutral-800 rounded-2xl shadow-sm font-medium"
                    >
                      {generatingFuncSpec ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <ScrollText className="h-4 w-4 mr-2" />
                      )}
                      Generate Functional Spec
                    </Button>
                    {funcSpecCost !== null && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-emerald-600 font-medium">Generated! ${funcSpecCost.toFixed(4)}</span>
                        <button
                          onClick={() => handleGenerateFuncSpec(true)}
                          disabled={generatingFuncSpec}
                          className="text-[#7B9B7B] hover:text-[#6B8B6B] flex items-center gap-1 font-medium"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Regenerate
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 p-4 bg-white/70 rounded-2xl text-xs text-neutral-600 space-y-1 border border-neutral-200">
                  <p className="flex items-center gap-1 font-medium">
                    <Clock className="h-3 w-3" />
                    Generation takes 20-60 seconds per document
                  </p>
                  <p><strong>RTM:</strong> Requirement Traceability Matrix with 4 tabs</p>
                  <p><strong>Func Spec:</strong> Complete functional specification</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {obligations.length > 0 && (
          <Card className="border-neutral-200 shadow-sm rounded-3xl bg-white">
            <CardHeader className="bg-gradient-to-r from-[#E8EDE8] to-[#EEF0EE] border-b border-neutral-200">
              <CardTitle className="flex items-center gap-2 text-neutral-800">
                <FileText className="h-5 w-5 text-[#7B9B7B]" />
                Extracted Obligations ({obligations.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {obligations.map((ob) => (
                  <div key={ob.id} className="border border-neutral-200 rounded-3xl p-5 space-y-3 hover:shadow-md transition-shadow bg-white">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${typeBadgeColor(ob.obligation_type)}`}>
                          {ob.obligation_type}
                        </span>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${effortBadgeColor(ob.estimated_effort)}`}>
                          {ob.estimated_effort} effort
                        </span>
                        {ob.implementation_type && ob.implementation_type !== 'no_change' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border bg-indigo-50 text-indigo-700 border-indigo-200">
                            {ob.implementation_type.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-sm font-semibold ${confidenceColor(ob.confidence)}`}>
                          {(ob.confidence * 100).toFixed(0)}%
                        </span>
                        <span className="text-xs text-neutral-500">confidence</span>
                      </div>
                    </div>

                    <p className="text-sm text-neutral-700 leading-relaxed">{ob.extracted_text}</p>
                    <p className="text-xs text-neutral-500">Section {ob.section_number}</p>

                    <div className="flex flex-wrap gap-2">
                      {ob.stakeholders?.map((s, i) => (
                        <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-xl text-xs bg-neutral-100 text-neutral-700 border border-neutral-200">
                          {s}
                        </span>
                      ))}
                      {ob.impacted_systems?.map((s, i) => (
                        <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-xl text-xs bg-blue-50 text-blue-700 border border-blue-200">
                          {s}
                        </span>
                      ))}
                    </div>

                    {ob.classification_reasoning && (
                      <p className="text-xs text-neutral-500 italic bg-neutral-50 p-3 rounded-2xl border border-neutral-200">
                        AI reasoning: {ob.classification_reasoning}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
