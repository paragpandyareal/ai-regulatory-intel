'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, Clock, Zap, DollarSign } from 'lucide-react';

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && (selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf'))) {
      setFile(selected);
      setError(null);
      setStage('idle');
      setObligations([]);
    } else if (selected) {
      setError('Please select a PDF file');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setError(null);
      setObligations([]);
      setStage('uploading');
      setProgress(10);

      // Step 1: Upload — server converts to base64
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace('.pdf', ''));
      formData.append('source', 'AEMO');
      formData.append('documentType', 'Procedure');

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) throw new Error(uploadData.error);

      setDocumentId(uploadData.document.id);

      if (uploadData.duplicate) {
        setStage('complete');
        setProgress(100);
        await fetchObligations(uploadData.document.id);
        return;
      }

      setProgress(25);
      setStage('parsing');

      // Step 2: Process — send the base64 from server response
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
      case 'binding': return 'bg-red-100 text-red-800 border-red-200';
      case 'guidance': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'definition': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'example': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const effortBadgeColor = (effort: string) => {
    switch (effort) {
      case 'trivial': return 'bg-green-100 text-green-800 border-green-200';
      case 'small': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'medium': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'large': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const confidenceColor = (c: number) => {
    if (c >= 0.9) return 'text-green-600';
    if (c >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Regulatory Intelligence</h1>
          <p className="text-gray-500 mt-1">Upload an Australian energy regulation PDF to extract and classify obligations</p>
        </div>

        {/* Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Document
            </CardTitle>
            <CardDescription>
              Supports AEMO, AEMC, AER, and ESB regulatory documents (PDF, max 50MB)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                disabled={stage === 'uploading' || stage === 'parsing' || stage === 'extracting' || stage === 'classifying'}
              />
              <Button
                onClick={handleUpload}
                disabled={!file || (stage !== 'idle' && stage !== 'complete' && stage !== 'error')}
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
                  <span className="flex items-center gap-2">
                    {stage === 'complete' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : stage === 'error' ? (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
                    )}
                    {stageLabels[stage]}
                  </span>
                  {stage === 'complete' && (
                    <span className="flex items-center gap-1 text-green-600">
                      <DollarSign className="h-3 w-3" />
                      ${processingCost.toFixed(4)} processing cost
                    </span>
                  )}
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Results Summary */}
        {stage === 'complete' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{obligations.length}</div>
                <p className="text-sm text-gray-500">Total Obligations</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-red-600">
                  {obligations.filter(o => o.obligation_type === 'binding').length}
                </div>
                <p className="text-sm text-gray-500">Binding</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-600">
                  {obligations.filter(o => o.obligation_type === 'guidance').length}
                </div>
                <p className="text-sm text-gray-500">Guidance</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">
                  ${processingCost.toFixed(4)}
                </div>
                <p className="text-sm text-gray-500">Processing Cost</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Obligations List */}
        {obligations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Extracted Obligations ({obligations.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {obligations.map((ob) => (
                  <div key={ob.id} className="border rounded-lg p-4 space-y-3 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${typeBadgeColor(ob.obligation_type)}`}>
                          {ob.obligation_type}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${effortBadgeColor(ob.estimated_effort)}`}>
                          {ob.estimated_effort} effort
                        </span>
                        {ob.implementation_type && ob.implementation_type !== 'no_change' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-indigo-100 text-indigo-800 border-indigo-200">
                            {ob.implementation_type.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-sm font-semibold ${confidenceColor(ob.confidence)}`}>
                          {(ob.confidence * 100).toFixed(0)}%
                        </span>
                        <span className="text-xs text-gray-400">confidence</span>
                      </div>
                    </div>

                    <p className="text-sm text-gray-800">{ob.extracted_text}</p>
                    <p className="text-xs text-gray-400">Section {ob.section_number}</p>

                    <div className="flex flex-wrap gap-1.5">
                      {ob.stakeholders?.map((s, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                          {s}
                        </span>
                      ))}
                      {ob.impacted_systems?.map((s, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-600">
                          {s}
                        </span>
                      ))}
                    </div>

                    {ob.classification_reasoning && (
                      <p className="text-xs text-gray-500 italic">
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
