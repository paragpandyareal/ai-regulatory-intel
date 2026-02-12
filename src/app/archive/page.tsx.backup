'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Archive, Search, FileText, Calendar, DollarSign, Loader2, TrendingUp, Clock, ArrowLeft } from 'lucide-react';

interface ArchivedDocument {
  id: string;
  title: string;
  source: string;
  document_type: string;
  uploaded_at: string;
  processed_at: string | null;
  obligation_count: number;
  processing_cost: number;
  auto_generated_title: boolean;
  extraction_status: string;
}

interface ArchiveStats {
  totalDocuments: number;
  totalObligations: number;
  totalCost: number;
}

export default function ArchivePage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<ArchivedDocument[]>([]);
  const [stats, setStats] = useState<ArchiveStats>({ totalDocuments: 0, totalObligations: 0, totalCost: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent');

  useEffect(() => {
    fetchArchive();
  }, [sortBy]);

  const fetchArchive = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ sortBy });
      if (search) params.append('search', search);
      
      const res = await fetch(`/api/archive?${params}`);
      const data = await res.json();
      
      setDocuments(data.documents || []);
      setStats(data.stats || { totalDocuments: 0, totalObligations: 0, totalCost: 0 });
    } catch (error) {
      console.error('Failed to fetch archive:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchArchive();
  };

  const handleDocumentClick = (docId: string) => {
    router.push(`/?docId=${docId}`);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not processed';
    return new Date(dateString).toLocaleDateString('en-AU', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 sm:p-6 md:p-12">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                onClick={() => router.push('/')}
                variant="outline"
                className="rounded-xl border-2"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900 tracking-tight flex items-center gap-3">
              <Archive className="h-8 w-8 text-[#7B9B7B]" />
              Document Archive
            </h1>
            <p className="text-sm sm:text-base text-neutral-600 font-medium">
              Complete history of all processed regulatory documents
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <Card className="border-2 border-neutral-300 shadow-md rounded-2xl bg-white">
            <CardContent className="pt-6 p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl sm:text-4xl font-bold text-neutral-900">{stats.totalDocuments}</div>
                  <p className="text-xs sm:text-sm text-neutral-600 mt-2 font-semibold">Documents</p>
                </div>
                <FileText className="h-10 w-10 text-[#7B9B7B]" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-neutral-300 shadow-md rounded-2xl bg-white">
            <CardContent className="pt-6 p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl sm:text-4xl font-bold text-blue-700">{stats.totalObligations}</div>
                  <p className="text-xs sm:text-sm text-neutral-600 mt-2 font-semibold">Total Obligations</p>
                </div>
                <TrendingUp className="h-10 w-10 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-neutral-300 shadow-md rounded-2xl bg-white">
            <CardContent className="pt-6 p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl sm:text-4xl font-bold text-emerald-700">${stats.totalCost.toFixed(2)}</div>
                  <p className="text-xs sm:text-sm text-neutral-600 mt-2 font-semibold">Total Processing</p>
                </div>
                <DollarSign className="h-10 w-10 text-emerald-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-2 border-neutral-300 shadow-md rounded-2xl bg-white">
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
                <Input
                  type="text"
                  placeholder="Search by title, source, or document type..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 border-2 rounded-xl"
                />
              </div>
              <Button type="submit" className="bg-[#7B9B7B] hover:bg-[#6B8B6B] rounded-xl px-6">
                Search
              </Button>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="border-2 border-neutral-300 rounded-xl px-4 py-2 font-semibold text-sm bg-white"
              >
                <option value="recent">Most Recent</option>
                <option value="complex">Most Complex</option>
                <option value="alphabetical">Alphabetical</option>
              </select>
            </form>
          </CardContent>
        </Card>

        {loading ? (
          <Card className="border-2 border-neutral-300 shadow-md rounded-2xl bg-white">
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#7B9B7B]" />
            </CardContent>
          </Card>
        ) : documents.length === 0 ? (
          <Card className="border-2 border-neutral-300 shadow-md rounded-2xl bg-white">
            <CardContent className="text-center py-12">
              <Archive className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
              <p className="text-neutral-600 font-semibold">No documents found</p>
              <p className="text-sm text-neutral-500 mt-2">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {documents.map((doc) => (
              <Card 
                key={doc.id}
                className="border-2 border-neutral-300 shadow-md rounded-2xl bg-white hover:shadow-lg hover:border-[#7B9B7B] transition-all cursor-pointer"
                onClick={() => handleDocumentClick(doc.id)}
              >
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <CardTitle className="text-base sm:text-lg font-bold text-neutral-900 flex items-start gap-2">
                        <FileText className="h-5 w-5 text-[#7B9B7B] flex-shrink-0 mt-0.5" />
                        <span className="break-words">
                          {doc.title}
                          {doc.auto_generated_title && (
                            <span className="ml-2 text-xs font-normal text-neutral-500">(AI-generated)</span>
                          )}
                        </span>
                      </CardTitle>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border-2 bg-blue-100 text-blue-800 border-blue-300">
                          {doc.source || 'Unknown'}
                        </span>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border-2 bg-purple-100 text-purple-800 border-purple-300">
                          {doc.document_type || 'Unknown'}
                        </span>
                        {doc.extraction_status === 'complete' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border-2 bg-emerald-100 text-emerald-800 border-emerald-300">
                            ✓ Processed
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-start sm:items-end gap-2 text-sm font-semibold shrink-0">
                      <div className="flex items-center gap-2 text-neutral-700">
                        <Calendar className="h-4 w-4" />
                        {formatDate(doc.processed_at || doc.uploaded_at)}
                      </div>
                      {doc.obligation_count > 0 && (
                        <div className="text-blue-700">
                          {doc.obligation_count} obligations
                        </div>
                      )}
                      {doc.processing_cost > 0 && (
                        <div className="flex items-center gap-1 text-emerald-700">
                          <DollarSign className="h-3 w-3" />
                          {doc.processing_cost.toFixed(4)}
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
