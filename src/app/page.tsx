'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, Clock, Zap, DollarSign, FileSpreadsheet, ScrollText, RefreshCw } from 'lucide-react';
import ComplianceCalendar from '@/components/ComplianceCalendar';
import CommencementDateInput from '@/components/CommencementDateInput';

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
  const [documentTitle, setDocumentTitle] = useState<string>('');
  const [generatingRTM, setGeneratingRTM] = useState(false);
  const [generatingFuncSpec, setGeneratingFuncSpec] = useState(false);
  const [rtmCost, setRtmCost] = useState<number | null>(null);
  const [funcSpecCost, setFuncSpecCost] = useState<number | null>(null);
  const [calendarKey, setCalendarKey] = useState(0);
  const [showDateInput, setShowDateInput] = useState(true);
  const [loadingDocument, setLoadingDocument] = useState(false);
  
  const obligationsRef = useRef<HTMLDivElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && (selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf'))) {
      setFile(selected);
      setError(null);
      setStage('idle');
      setObligations([]);
      setRtmCost(null);
      setFuncSpecCost(null);
      setDocumentTitle(selected.name.replace('.pdf', ''));
      setShowDateInput(true);
    } else if (selected) {
      setError('Please select a PDF file');
    }
  };

  const checkIfDatesExist = async (docId: string) => {
    try {
      const res = await fetch(`/api/document-dates?documentId=${docId}`);
      if (res.ok) {
        const data = await res.json();
        return data.dates && data.dates.length > 0;
      }
    } catch (err) {
      console.error('Error checking dates:', err);
    }
    return false;
  };

  const handleCalendarDocumentClick = async (docId: string, docTitle: string) => {
    setLoadingDocument(true);
    setDocumentId(docId);
    setDocumentTitle(docTitle);
    setStage('complete');
    setShowDateInput(false);
    
    try {
      await fetchObligations(docId);
      
      // Scroll to obligations section after a brief delay
      setTimeout(() => {
        obligationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } catch (err) {
      console.error('Error loading document:', err);
    } finally {
      setLoadingDocument(false);
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
      setShowDateInput(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace('.pdf', ''));
      formData.append('source', 'AEMO');
      formData.append('documentType', 'Procedure');

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) throw new Error(uploadData.error);

      setDocumentId(uploadData.document.id);
      setDocumentTitle(file.name.replace('.pdf', ''));

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
        
        const hasExistingDates = await checkIfDatesExist(uploadData.document.id);
        setShowDateInput(!hasExistingDates);
        
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

  const handleDatesSaved = () => {
    setCalendarKey(prev => prev + 1);
    setShowDateInput(false);
  };

  const handleSkip = () => {
    setShowDateInput(false);
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
      case 'binding': return 'bg-red-100 text-red-800 border-red-300';
      case 'guidance': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'definition': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'example': return 'bg-neutral-100 text-neutral-700 border-neutral-300';
      default: return 'bg-neutral-100 text-neutral-700 border-neutral-300';
    }
  };

  const effortBadgeColor = (effort: string) => {
    switch (effort) {
      case 'trivial': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'small': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'medium': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'large': return 'bg-rose-100 text-rose-800 border-rose-300';
      default: return 'bg-neutral-100 text-neutral-700 border-neutral-300';
    }
  };

  const confidenceColor = (c: number) => {
    if (c >= 0.9) return 'text-emerald-700';
    if (c >= 0.7) return 'text-amber-700';
    return 'text-rose-700';
  };

  const isProcessing = stage === 'uploading' || stage === 'parsing' || stage === 'extracting' || stage === 'classifying';

  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-3 py-6">
          <h1 className="text-5xl font-bold text-neutral-900 tracking-tight">
            AI Regulatory Intelligence
          </h1>
          <p className="text-lg text-neutral-600 font-medium">Upload an Australian energy regulation PDF to extract and classify obligations</p>
        </div>

        <ComplianceCalendar key={calendarKey} onDocumentClick={handleCalendarDocumentClick} />

        <Card className="border-neutral-300 shadow-lg rounded-3xl overflow-hidden bg-white">
          <CardHeader className="bg-gradient-to-r from-[#7B9B7B] to-[#6B8B6B] border-b-2 border-neutral-300">
            <CardTitle className="flex items-center gap-3 text-white">
              <Upload className="h-6 w-6" />
              Upload Regulatory Document
            </CardTitle>
            <CardDescription className="text-white/90 mt-2 font-medium">
              Supports AEMO, AEMC, AER, and ESB regulatory documents (PDF, max 50MB)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="block w-full text-sm text-neutral-700 font-medium file:mr-4 file:py-3 file:px-6 file:rounded-2xl file:border-2 file:border-[#7B9B7B] file:text-sm file:font-bold file:bg-[#E8EDE8] file:text-[#5B7B5B] hover:file:bg-[#DFE7DF] transition-all cursor-pointer"
                disabled={isProcessing}
              />
              <Button
                onClick={() => handleUpload(false)}
                disabled={!file || (stage !== 'idle' && stage !== 'complete' && stage !== 'error')}
                className="bg-[#7B9B7B] hover:bg-[#6B8B6B] text-white rounded-2xl px-8 py-6 shadow-md font-bold text-base border-2 border-neutral-300"
              >
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <Zap className="h-5 w-5 mr-2" />
                )}
                Process PDF
              </Button>
            </div>

            {stage !== 'idle' && (
              <div className="space-y-2 bg-neutral-50 p-4 rounded-2xl border-2 border-neutral-200">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="flex items-center gap-2 text-neutral-800">
                    {stage === 'complete' ? (
                      <CheckCircle className="h-5 w-5 text-emerald-600" />
                    ) : stage === 'error' ? (
                      <AlertCircle className="h-5 w-5 text-rose-600" />
                    ) : (
                      <Clock className="h-5 w-5 text-[#7B9B7B] animate-pulse" />
                    )}
                    {stageLabels[stage]}
                  </span>
                  {stage === 'complete' && (
                    <span className="flex items-center gap-1 text-emerald-700 font-bold">
                      <DollarSign className="h-4 w-4" />
                      ${processingCost.toFixed(4)} cost
                    </span>
                  )}
                </div>
                <Progress value={progress} className="h-3 bg-neutral-200" />
              </div>
            )}

            {error && (
              <p className="text-sm text-rose-700 font-semibold flex items-center gap-2 bg-rose-50 p-4 rounded-2xl border-2 border-rose-300">
                <AlertCircle className="h-5 w-5" /> {error}
              </p>
            )}
          </CardContent>
        </Card>

        {stage === 'complete' && documentId && showDateInput && (
          <CommencementDateInput 
            documentId={documentId} 
            documentTitle={documentTitle}
            onSaved={handleDatesSaved}
            onSkip={handleSkip}
          />
        )}

        {loadingDocument && (
          <Card className="border-neutral-300 shadow-md rounded-3xl bg-white">
            <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#7B9B7B]" />
              <p className="text-sm text-neutral-600 font-medium">Loading obligations for {documentTitle}...</p>
            </CardContent>
          </Card>
        )}

        {stage === 'complete' && obligations.length > 0 && !loadingDocument && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-neutral-300 shadow-md rounded-3xl hover:shadow-lg transition-shadow bg-white">
                <CardContent className="pt-6">
                  <div className="text-4xl font-bold text-neutral-900">{obligations.length}</div>
                  <p className="text-sm text-neutral-600 mt-2 font-semibold">Total Obligations</p>
                </CardContent>
              </Card>
              <Card className="border-neutral-300 shadow-md rounded-3xl hover:shadow-lg transition-shadow bg-white">
                <CardContent className="pt-6">
                  <div className="text-4xl font-bold text-rose-700">
                    {obligations.filter(o => o.obligation_type === 'binding').length}
                  </div>
                  <p className="text-sm text-neutral-600 mt-2 font-semibold">Binding</p>
                </CardContent>
              </Card>
              <Card className="border-neutral-300 shadow-md rounded-3xl hover:shadow-lg transition-shadow bg-white">
                <CardContent className="pt-6">
                  <div className="text-4xl font-bold text-blue-700">
                    {obligations.filter(o => o.obligation_type === 'guidance').length}
                  </div>
                  <p className="text-sm text-neutral-600 mt-2 font-semibold">Guidance</p>
                </CardContent>
              </Card>
              <Card className="border-neutral-300 shadow-md rounded-3xl hover:shadow-lg transition-shadow bg-white">
                <CardContent className="pt-6">
                  <div className="text-4xl font-bold text-emerald-700">
                    ${totalCost.toFixed(4)}
                  </div>
                  <p className="text-sm text-neutral-600 mt-2 font-semibold">Total Cost</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-neutral-300 shadow-lg rounded-3xl bg-gradient-to-br from-amber-50 to-yellow-50">
              <CardHeader className="border-b-2 border-amber-200">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl text-neutral-900 font-bold">Generate Compliance Documents</CardTitle>
                    <CardDescription className="text-neutral-700 font-medium mt-1">
                      Convert extracted obligations into professional Word deliverables
                    </CardDescription>
                  </div>
                  <button
                    onClick={() => handleUpload(true)}
                    disabled={isProcessing}
                    className="text-[#7B9B7B] hover:text-[#6B8B6B] flex items-center gap-2 text-sm font-bold disabled:opacity-50 bg-white px-4 py-2 rounded-xl border-2 border-[#7B9B7B]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reprocess PDF
                  </button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Button
                      onClick={() => handleGenerateRTM(false)}
                      disabled={generatingRTM}
                      className="w-full bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 text-neutral-900 rounded-2xl shadow-md font-bold text-base py-6 border-2 border-amber-500"
                    >
                      {generatingRTM ? (
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      ) : (
                        <FileSpreadsheet className="h-5 w-5 mr-2" />
                      )}
                      Generate RTM
                    </Button>
                    {rtmCost !== null && (
                      <div className="flex items-center justify-between text-xs bg-white p-2 rounded-xl border-2 border-emerald-300">
                        <span className="text-emerald-700 font-bold">✓ Generated! ${rtmCost.toFixed(4)}</span>
                        <button
                          onClick={() => handleGenerateRTM(true)}
                          disabled={generatingRTM}
                          className="text-[#7B9B7B] hover:text-[#6B8B6B] flex items-center gap-1 font-bold"
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
                      className="w-full bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 text-neutral-900 rounded-2xl shadow-md font-bold text-base py-6 border-2 border-amber-500"
                    >
                      {generatingFuncSpec ? (
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      ) : (
                        <ScrollText className="h-5 w-5 mr-2" />
                      )}
                      Generate Functional Spec
                    </Button>
                    {funcSpecCost !== null && (
                      <div className="flex items-center justify-between text-xs bg-white p-2 rounded-xl border-2 border-emerald-300">
                        <span className="text-emerald-700 font-bold">✓ Generated! ${funcSpecCost.toFixed(4)}</span>
                        <button
                          onClick={() => handleGenerateFuncSpec(true)}
                          disabled={generatingFuncSpec}
                          className="text-[#7B9B7B] hover:text-[#6B8B6B] flex items-center gap-1 font-bold"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Regenerate
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 p-4 bg-white rounded-2xl text-xs text-neutral-700 space-y-1 border-2 border-amber-200">
                  <p className="flex items-center gap-2 font-bold text-sm">
                    <Clock className="h-4 w-4" />
                    Generation takes 20-60 seconds per document
                  </p>
                  <p className="font-medium"><strong>RTM:</strong> Requirement Traceability Matrix with 4 tabs</p>
                  <p className="font-medium"><strong>Func Spec:</strong> Complete functional specification</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {obligations.length > 0 && !loadingDocument && (
          <div ref={obligationsRef}>
            <Card className="border-neutral-300 shadow-lg rounded-3xl bg-white">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-neutral-300">
                <CardTitle className="flex items-center gap-3 text-neutral-900 text-xl font-bold">
                  <FileText className="h-6 w-6 text-blue-700" />
                  Obligations for: {documentTitle} ({obligations.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {obligations.map((ob) => (
                    <div key={ob.id} className="border-2 border-neutral-300 rounded-2xl p-5 space-y-3 hover:shadow-lg transition-all bg-white hover:border-blue-400">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border-2 ${typeBadgeColor(ob.obligation_type || 'guidance')}`}>
                            {(ob.obligation_type || 'GUIDANCE').toUpperCase()}
                          </span>
                          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border-2 ${effortBadgeColor(ob.estimated_effort || 'medium')}`}>
                            {(ob.estimated_effort || 'MEDIUM').toUpperCase()} EFFORT
                          </span>
                          {ob.implementation_type && ob.implementation_type !== 'no_change' && (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border-2 bg-indigo-100 text-indigo-800 border-indigo-300">
                              {ob.implementation_type.replace('_', ' ').toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`text-base font-bold ${confidenceColor(ob.confidence || 0)}`}>
                            {((ob.confidence || 0) * 100).toFixed(0)}%
                          </span>
                          <span className="text-xs text-neutral-600 font-semibold">confidence</span>
                        </div>
                      </div>

                      <p className="text-sm text-neutral-800 leading-relaxed font-medium">{ob.extracted_text}</p>
                      <p className="text-xs text-neutral-600 font-semibold">Section {ob.section_number || 'Unknown'}</p>

                      <div className="flex flex-wrap gap-2">
                        {ob.stakeholders?.map((s, i) => (
                          <span key={i} className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold bg-neutral-100 text-neutral-800 border-2 border-neutral-300">
                            {s}
                          </span>
                        ))}
                        {ob.impacted_systems?.map((s, i) => (
                          <span key={i} className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold bg-blue-100 text-blue-800 border-2 border-blue-300">
                            {s}
                          </span>
                        ))}
                      </div>

                      {ob.classification_reasoning && (
                        <p className="text-xs text-neutral-700 italic bg-neutral-50 p-3 rounded-2xl border-2 border-neutral-200 font-medium">
                          <strong>AI reasoning:</strong> {ob.classification_reasoning}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
