'use client';

import { useState, useEffect } from 'react';
import { Loader2, FileText, FileSpreadsheet, Clock, Zap, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function PlatformStats() {
  const [stats, setStats] = useState({
    documentCount: 0,
    pageCount: 0,
    hoursSaved: 0,
    totalObligations: 0,
    totalCost: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/platform-stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch platform stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
        <span className="text-sm text-neutral-500">Loading stats...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 justify-items-center lg:justify-items-stretch">
      <Card className="border-2 border-neutral-300 shadow-md rounded-2xl bg-white hover:shadow-lg transition-shadow w-full">
        <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#7B9B7B]">{stats.documentCount}</div>
              <p className="text-xs sm:text-sm text-neutral-600 mt-1 sm:mt-2 font-semibold">Documents</p>
            </div>
            <FileText className="h-8 w-8 sm:h-10 sm:w-10 text-[#7B9B7B] opacity-50" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-neutral-300 shadow-md rounded-2xl bg-white hover:shadow-lg transition-shadow w-full">
        <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-blue-700">{stats.pageCount}</div>
              <p className="text-xs sm:text-sm text-neutral-600 mt-1 sm:mt-2 font-semibold">Pages Analyzed</p>
            </div>
            <FileSpreadsheet className="h-8 w-8 sm:h-10 sm:w-10 text-blue-700 opacity-50" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-neutral-300 shadow-md rounded-2xl bg-white hover:shadow-lg transition-shadow w-full">
        <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-purple-700">{stats.totalObligations}</div>
              <p className="text-xs sm:text-sm text-neutral-600 mt-1 sm:mt-2 font-semibold">Obligations</p>
            </div>
            <Zap className="h-8 w-8 sm:h-10 sm:w-10 text-purple-700 opacity-50" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-neutral-300 shadow-md rounded-2xl bg-white hover:shadow-lg transition-shadow w-full">
        <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-emerald-700">~{stats.hoursSaved}</div>
              <p className="text-xs sm:text-sm text-neutral-600 mt-1 sm:mt-2 font-semibold">Hours Saved</p>
            </div>
            <Clock className="h-8 w-8 sm:h-10 sm:w-10 text-emerald-700 opacity-50" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-neutral-300 shadow-md rounded-2xl bg-white hover:shadow-lg transition-shadow w-full lg:col-start-auto col-span-2 max-w-[50%] lg:max-w-none mx-auto lg:mx-0">
        <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-amber-700">${stats.totalCost.toFixed(2)}</div>
              <p className="text-xs sm:text-sm text-neutral-600 mt-1 sm:mt-2 font-semibold">Total Cost</p>
            </div>
            <DollarSign className="h-8 w-8 sm:h-10 sm:w-10 text-amber-700 opacity-50" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
