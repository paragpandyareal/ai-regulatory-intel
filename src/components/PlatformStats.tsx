'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function PlatformStats() {
  const [stats, setStats] = useState({
    documentCount: 0,
    pageCount: 0,
    hoursSaved: 0,
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
      <div className="flex items-center justify-center gap-2 text-base text-neutral-500 py-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading stats...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-sm sm:text-base font-semibold text-neutral-700 bg-neutral-50 border-2 border-neutral-200 rounded-2xl px-6 py-4 max-w-3xl mx-auto">
      <span className="flex items-center gap-2">
        <span className="text-3xl sm:text-4xl font-bold text-[#7B9B7B]">{stats.documentCount}</span>
        <span className="text-neutral-700">documents</span>
      </span>
      <span className="text-neutral-300 hidden sm:block">·</span>
      <span className="flex items-center gap-2">
        <span className="text-3xl sm:text-4xl font-bold text-blue-700">{stats.pageCount.toLocaleString()}</span>
        <span className="text-neutral-700">pages analyzed</span>
      </span>
      <span className="text-neutral-300 hidden sm:block">·</span>
      <span className="flex items-center gap-2">
        <span className="text-3xl sm:text-4xl font-bold text-emerald-700">~{stats.hoursSaved.toLocaleString()}</span>
        <span className="text-neutral-700">hours saved</span>
      </span>
    </div>
  );
}
