'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, Clock, Zap, DollarSign, FileSpreadsheet, ScrollText, RefreshCw, Info, Archive, Calendar } from 'lucide-react';
import ComplianceCalendar from '@/components/ComplianceCalendar';
import CommencementDateInput from '@/components/CommencementDateInput';
import Logo from '@/components/Logo';
import PlatformStats from '@/components/PlatformStats';

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

function HomeContent() {
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
  const [processingMessage, setProcessingMessage] = useState<string>('');
  
  const obligationsRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  const handleLogoClick = () => {
    // Reset all state to initial values
    setFile(null);
    setStage('idle');
    setProgress(0);
    setObligations([]);
    setError(null);
    setProcessingCost(0);
    setDocumentId(null);
    setDocumentTitle('');
    setRtmCost(null);
    setFuncSpecCost(null);
    setShowDateInput(true);
    setLoadingDocument(false);
    setProcessingMessage('');
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Load document from URL parameter
  useEffect(() => {
    const docId = searchParams.get('docId');
    console.log('[URL Params] docId from URL:', docId);
    if (docId) {
      console.log('[URL Params] Loading document:', docId);
      handleLoadArchivedDocument(docId);
    }
  }, [searchParams]);

  const handleLoadArchivedDocument = async (docId: string) => {
    console.log("[Archive Load] Starting to load:", docId);
    try {
      setLoadingDocument(true);
      setDocumentId(docId);
      setStage('complete');
      setShowDateInput(false);
      
      // Fetch document details
      const docRes = await fetch(`/api/document-details?documentId=${docId}`);
      if (docRes.ok) {
        const docData = await docRes.json();
        setDocumentTitle(docData.title);
        setProcessingCost(docData.processing_cost || 0);
      }
      
      // Fetch obligations
      await fetchObligations(docId);
      
      // Scroll to obligations section
      setTimeout(() => {
        obligationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } catch (err) {
      console.error('Error loading archived document:', err);
      setError('Failed to load document from archive');
    } finally {
      setLoadingDocument(false);
    }
  };


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

      // Convert PDF to base64
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const pdfBase64 = buffer.toString('base64');

      // Extract page count using Claude API
      let pageCount = 0;
      try {
        const pageCountRes = await fetch('/api/extract-page-count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64 }),
        });
        const pageCountData = await pageCountRes.json();
        pageCount = pageCountData.pageCount || 0;
        console.log(`[Upload] Claude detected ${pageCount} pages`);
      } catch (err) {
        console.error('Page count extraction failed:', err);
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace('.pdf', ''));
      formData.append('source', 'AEMO');
      formData.append('documentType', 'Procedure');
      formData.append('pageCount', pageCount.toString());

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
      setProcessingMessage('AI is analyzing your document - this typically takes 2-10 minutes depending on document size and complexity');

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
      setProcessingMessage('Processing continues - extracting obligations and running AI classification...');

      const processData = await processRes.json();

      if (!processRes.ok) throw new Error(processData.error || 'Processing failed');

      setProcessingCost(processData.cost || 0);
      setProgress(100);
      setStage('complete');
      setProcessingMessage('');

      const docId = uploadData.document.id;
      const obligationsCount = await fetchObligations(docId);
      
      // Update document metadata after processing
      console.log('[Metadata] Updating doc:', docId, 'with', obligationsCount, 'obligations');
      try {
        const metadataRes = await fetch('/api/update-document-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            documentId: docId, 
            processing_cost: processData.cost || 0,
            obligation_count: obligationsCount,
            processed_at: new Date().toISOString(),
            extraction_status: 'complete'
          }),
        });
        const metadataData = await metadataRes.json();
        console.log('[Metadata] Update response:', metadataData);
      } catch (err) {
        console.error('[Metadata] Update failed:', err);
      }

    } catch (err: any) {
      setError(err.message || 'Processing failed');
      setStage('error');
    }
  };

  const fetchObligations = async (docId: string): Promise<number> => {
    const res = await fetch(`/api/obligations?documentId=${docId}`);
    if (res.ok) {
      const data = await res.json();
      const obligations = data.obligations || [];
      setObligations(obligations);
      return obligations.length;
    }
    return 0;
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
    <main className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 sm:p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
        <div className="text-center space-y-6 sm:space-y-8 py-6 sm:py-8">
          <div className="flex items-center justify-center gap-4 mb-2">
            <Link href="/archive">
              <Button 
                variant="outline" 
                className="bg-white border-2 border-[#7B9B7B] text-[#7B9B7B] hover:bg-[#E8EDE8] rounded-xl font-bold"
              >
                <Archive className="h-4 w-4 mr-2" />
                View Archive
              </Button>
            </Link>
          </div>
          
          <div onClick={handleLogoClick} className="inline-block cursor-pointer">
            <Logo />
          </div>
          
          <p className="text-base sm:text-lg md:text-xl text-neutral-600 font-medium px-4 max-w-3xl mx-auto">
            Upload Australian energy regulation PDFs to extract and classify obligations
          </p>
          
          <PlatformStats />
        </div>

        <Card className="border-2 border-blue-300 shadow-md rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-blue-900 text-lg font-bold">
              <Info className="h-5 w-5" />
              How to Use This Tool
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="space-y-3 text-sm text-blue-900">
              <div className="flex gap-3">
                <span className="font-bold text-blue-700 flex-shrink-0">1.</span>
                <p><strong>Check if document exists:</strong> Browse the Calendar or Archive to see if someone already uploaded your regulatory document. Click any entry to load its obligations.</p>
              </div>
              <div className="flex gap-3">
                <span className="font-bold text-blue-700 flex-shrink-0">2.</span>
                <p><strong>Upload new document:</strong> If not found, upload your PDF and click "Process PDF". Be patient - processing takes 2-10 minutes depending on document size, but delivers thorough AI analysis.</p>
              </div>
              <div className="flex gap-3">
                <span className="font-bold text-blue-700 flex-shrink-0">3.</span>
                <p><strong>Generate deliverables:</strong> Once obligations appear, click "Generate RTM" or "Generate Functional Spec" to create professional Word documents (20-60 seconds each).</p>
              </div>
              <div className="flex gap-3">
                <span className="font-bold text-blue-700 flex-shrink-0">4.</span>
                <p><strong>Add to calendar:</strong> After processing completes, add commencement dates so the document appears in the Compliance Calendar. This helps everyone track upcoming regulatory deadlines. Click "Save Dates" when done.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <ComplianceCalendar key={calendarKey} onDocumentClick={handleCalendarDocumentClick} />

        <Card className="border-2 sm:border-neutral-300 shadow-md sm:shadow-lg rounded-2xl sm:rounded-3xl overflow-hidden bg-white">
          <CardHeader className="bg-gradient-to-r from-[#7B9B7B] to-[#6B8B6B] border-b-2 border-neutral-300 p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 sm:gap-3 text-white text-base sm:text-lg md:text-xl">
              <Upload className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0" />
              Upload Regulatory Document
            </CardTitle>
            <CardDescription className="text-white/90 mt-1 sm:mt-2 font-medium text-xs sm:text-sm">
              Supports AEMO, AEMC, AER, and ESC regulatory documents (PDF, max 50MB)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 pt-4 sm:pt-6 p-3 sm:p-6">
            {/* Inline usage notice */}
            <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <p className="font-semibold">For public regulatory documents only</p>
                  <p className="text-xs mt-1 text-blue-800">Upload publicly available AEMO, AEMC, AER, or ESC regulations. Do not upload confidential or proprietary materials.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="block w-full text-xs sm:text-sm text-neutral-700 font-medium file:mr-2 sm:file:mr-4 file:py-2 sm:file:py-3 file:px-3 sm:file:px-6 file:rounded-xl sm:file:rounded-2xl file:border-2 file:border-[#7B9B7B] file:text-xs sm:file:text-sm file:font-bold file:bg-[#E8EDE8] file:text-[#5B7B5B] hover:file:bg-[#DFE7DF] transition-all cursor-pointer"
                disabled={isProcessing}
              />
              <Button
                onClick={() => handleUpload(false)}
                disabled={!file || (stage !== 'idle' && stage !== 'complete' && stage !== 'error')}
                className="bg-[#7B9B7B] hover:bg-[#6B8B6B] text-white rounded-xl sm:rounded-2xl px-6 sm:px-8 py-5 sm:py-6 shadow-md font-bold text-sm sm:text-base border-2 border-neutral-300 w-full sm:w-auto whitespace-nowrap"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                )}
                Process PDF
              </Button>
            </div>

            {stage !== 'idle' && (
              <div className="space-y-2 bg-neutral-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-neutral-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs sm:text-sm font-semibold">
                  <span className="flex items-center gap-2 text-neutral-800">
                    {stage === 'complete' ? (
                      <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 flex-shrink-0" />
                    ) : stage === 'error' ? (
                      <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-rose-600 flex-shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-[#7B9B7B] animate-pulse flex-shrink-0" />
                    )}
                    <span className="break-words">{stageLabels[stage]}</span>
                  </span>
                  {stage === 'complete' && (
                    <span className="flex items-center gap-1 text-emerald-700 font-bold whitespace-nowrap">
                      <DollarSign className="h-3 w-3 sm:h-4 sm:w-4" />
                      ${processingCost.toFixed(4)} cost
                    </span>
                  )}
                </div>
                <Progress value={progress} className="h-2 sm:h-3 bg-neutral-200" />
                {processingMessage && (
                  <div className="mt-2 p-3 bg-blue-50 border-l-4 border-blue-400 rounded">
                    <p className="text-sm text-blue-900 font-medium animate-pulse">
                      ⏳ {processingMessage}
                    </p>
                  </div>
                )}
                {isProcessing && (
                  <div className="mt-2 p-3 bg-amber-50 border-l-4 border-amber-400 rounded">
                    <p className="text-xs text-amber-900 font-semibold">
                      💡 Deep AI analysis in progress. This typically takes 2-10 minutes depending on document size and complexity. Please be patient - we're doing a thorough job!
                    </p>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs sm:text-sm text-rose-700 font-semibold flex items-start gap-2 bg-rose-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-rose-300">
                <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 mt-0.5" /> 
                <span className="break-words">{error}</span>
              </p>
            )}
          </CardContent>
        </Card>

        {documentId && showDateInput && (
          <CommencementDateInput 
            documentId={documentId} 
            documentTitle={documentTitle}
            onSaved={handleDatesSaved}
            onSkip={handleSkip}
          />
        )}

        {loadingDocument && (
          <Card className="border-2 sm:border-neutral-300 shadow-md rounded-2xl sm:rounded-3xl bg-white">
            <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12 gap-3 p-4">
              <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-[#7B9B7B]" />
              <p className="text-xs sm:text-sm text-neutral-600 font-medium text-center px-2">
                Loading obligations for {documentTitle}...
              </p>
            </CardContent>
          </Card>
        )}

        {stage === 'complete' && obligations.length > 0 && !loadingDocument && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
              <Card className="border-2 sm:border-neutral-300 shadow-md rounded-2xl sm:rounded-3xl hover:shadow-lg transition-shadow bg-white">
                <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900">{obligations.length}</div>
                  <p className="text-xs sm:text-sm text-neutral-600 mt-1 sm:mt-2 font-semibold">Total Obligations</p>
                </CardContent>
              </Card>
              <Card className="border-2 sm:border-neutral-300 shadow-md rounded-2xl sm:rounded-3xl hover:shadow-lg transition-shadow bg-white">
                <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-rose-700">
                    {obligations.filter(o => o.obligation_type === 'binding').length}
                  </div>
                  <p className="text-xs sm:text-sm text-neutral-600 mt-1 sm:mt-2 font-semibold">Binding</p>
                </CardContent>
              </Card>
              <Card className="border-2 sm:border-neutral-300 shadow-md rounded-2xl sm:rounded-3xl hover:shadow-lg transition-shadow bg-white">
                <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-blue-700">
                    {obligations.filter(o => o.obligation_type === 'guidance').length}
                  </div>
                  <p className="text-xs sm:text-sm text-neutral-600 mt-1 sm:mt-2 font-semibold">Guidance</p>
                </CardContent>
              </Card>
              <Card className="border-2 sm:border-neutral-300 shadow-md rounded-2xl sm:rounded-3xl hover:shadow-lg transition-shadow bg-white">
                <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-emerald-700">
                    ${totalCost.toFixed(4)}
                  </div>
                  <p className="text-xs sm:text-sm text-neutral-600 mt-1 sm:mt-2 font-semibold">Total Cost</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-2 sm:border-neutral-300 shadow-md sm:shadow-lg rounded-2xl sm:rounded-3xl bg-gradient-to-br from-amber-50 to-yellow-50">
              <CardHeader className="border-b-2 border-amber-200 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                  <div>
                    <CardTitle className="text-base sm:text-lg md:text-xl text-neutral-900 font-bold">Generate Compliance Documents</CardTitle>
                    <CardDescription className="text-neutral-700 font-medium mt-1 text-xs sm:text-sm">
                      Convert extracted obligations into professional Word deliverables
                    </CardDescription>
                  </div>
                  <button
                    onClick={() => handleUpload(true)}
                    disabled={isProcessing}
                    className="text-[#7B9B7B] hover:text-[#6B8B6B] flex items-center gap-2 text-xs sm:text-sm font-bold disabled:opacity-50 bg-white px-3 sm:px-4 py-2 rounded-xl border-2 border-[#7B9B7B] whitespace-nowrap"
                  >
                    <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4" />
                    Reprocess PDF
                  </button>
                </div>
              </CardHeader>
              <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-2">
                    <Button
                      onClick={() => handleGenerateRTM(false)}
                      disabled={generatingRTM}
                      className="w-full bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 text-neutral-900 rounded-xl sm:rounded-2xl shadow-md font-bold text-sm sm:text-base py-5 sm:py-6 border-2 border-amber-500"
                    >
                      {generatingRTM ? (
                        <>
                          <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin mr-2" />
                          Generating RTM...
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                          Generate RTM
                        </>
                      )}
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
                      className="w-full bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 text-neutral-900 rounded-xl sm:rounded-2xl shadow-md font-bold text-sm sm:text-base py-5 sm:py-6 border-2 border-amber-500"
                    >
                      {generatingFuncSpec ? (
                        <>
                          <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin mr-2" />
                          Generating Spec...
                        </>
                      ) : (
                        <>
                          <ScrollText className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                          Generate Functional Spec
                        </>
                      )}
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
                <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-amber-50 rounded-xl sm:rounded-2xl text-xs border-2 border-amber-300">
                  <p className="flex items-center gap-2 font-bold text-sm text-amber-900 mb-2">
                    <Clock className="h-4 w-4 flex-shrink-0" />
                    ⏱️ Generation takes 20-60 seconds per document
                  </p>
                  <p className="font-medium text-amber-800"><strong>RTM:</strong> Requirement Traceability Matrix with 4 tabs</p>
                  <p className="font-medium text-amber-800"><strong>Func Spec:</strong> Complete functional specification</p>
                  {(generatingRTM || generatingFuncSpec) && (
                    <p className="font-semibold text-amber-900 mt-2 animate-pulse">💡 Claude is doing deep analysis - please be patient for best results!</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {obligations.length > 0 && !loadingDocument && (
          <div ref={obligationsRef}>
            <Card className="border-2 sm:border-neutral-300 shadow-md sm:shadow-lg rounded-2xl sm:rounded-3xl bg-white">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-neutral-300 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="flex items-start gap-2 sm:gap-3 text-neutral-900 text-base sm:text-lg md:text-xl font-bold">
                    <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-blue-700 flex-shrink-0 mt-0.5" />
                    <span className="break-words">Obligations for: {documentTitle} ({obligations.length})</span>
                  </CardTitle>
                  <Button
                    onClick={() => setShowDateInput(true)}
                    variant="outline"
                    className="bg-white border-2 border-blue-500 text-blue-700 hover:bg-blue-50 rounded-xl font-bold text-sm whitespace-nowrap"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Manage Dates
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
                <div className="space-y-3 sm:space-y-4">
                  {obligations.map((ob) => (
                    <div key={ob.id} className="border-2 border-neutral-300 rounded-xl sm:rounded-2xl p-3 sm:p-5 space-y-2 sm:space-y-3 hover:shadow-lg transition-all bg-white hover:border-blue-400">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <span className={`inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold border-2 ${typeBadgeColor(ob.obligation_type || 'guidance')}`}>
                            {(ob.obligation_type || 'GUIDANCE').toUpperCase()}
                          </span>
                          <span className={`inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold border-2 ${effortBadgeColor(ob.estimated_effort || 'medium')}`}>
                            {(ob.estimated_effort || 'MEDIUM').toUpperCase()} EFFORT
                          </span>
                          {ob.implementation_type && ob.implementation_type !== 'no_change' && (
                            <span className="inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold border-2 bg-indigo-100 text-indigo-800 border-indigo-300">
                              {ob.implementation_type.replace('_', ' ').toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`text-sm sm:text-base font-bold ${confidenceColor(ob.confidence || 0)}`}>
                            {((ob.confidence || 0) * 100).toFixed(0)}%
                          </span>
                          <span className="text-xs text-neutral-600 font-semibold">confidence</span>
                        </div>
                      </div>

                      <p className="text-xs sm:text-sm text-neutral-800 leading-relaxed font-medium break-words">{ob.extracted_text}</p>
                      <p className="text-[10px] sm:text-xs text-neutral-600 font-semibold">Section {ob.section_number || 'Unknown'}</p>

                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {ob.stakeholders?.map((s, i) => (
                          <span key={i} className="inline-flex items-center px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold bg-neutral-100 text-neutral-800 border-2 border-neutral-300">
                            {s}
                          </span>
                        ))}
                        {ob.impacted_systems?.map((s, i) => (
                          <span key={i} className="inline-flex items-center px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold bg-blue-100 text-blue-800 border-2 border-blue-300">
                            {s}
                          </span>
                        ))}
                      </div>

                      {ob.classification_reasoning && (
                        <p className="text-[10px] sm:text-xs text-neutral-700 italic bg-neutral-50 p-2 sm:p-3 rounded-xl sm:rounded-2xl border-2 border-neutral-200 font-medium break-words">
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

        {/* Footer Privacy Notice */}
        <Card className="border border-neutral-300 rounded-2xl bg-neutral-50">
          <CardContent className="p-4">
            <p className="text-xs text-neutral-600 text-center">
              <strong>Privacy Notice:</strong> This is a public tool. Uploaded documents are stored publicly and accessible to others. 
              Only upload publicly available regulatory materials. By using this tool, you acknowledge that all uploaded content will be publicly visible.
            </p>
                <p className="text-xs text-neutral-500 text-center border-t border-neutral-200 pt-2">
      <strong>Disclaimer:</strong> This tool is provided free of charge as an experimental AI resource. Outputs are AI-generated and have not been independently verified — do not rely solely on them for regulatory compliance decisions. Always cross-reference with primary sources (AEMC, AEMO, AER, ESC). Documents uploaded are processed by third-party AI services; no guarantee is made regarding the security or confidentiality of uploaded content. Do not upload sensitive or confidential information. The creator accepts no responsibility or liability for the accuracy, quality, or security of any output or uploaded information. Use at your own risk.
    </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
