'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Loader2, ChevronLeft, ChevronRight, List, Grid3x3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DateGroup {
  date: string;
  obligations: any[];
  documents: any[];
  bindingCount: number;
  guidanceCount: number;
  totalItems: number;
}

interface Props {
  onDocumentClick?: (documentId: string, documentTitle: string) => void;
}

export default function ComplianceCalendar({ onDocumentClick }: Props) {
  const [loading, setLoading] = useState(true);
  const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'timeline' | 'month'>('timeline');

  useEffect(() => {
    fetchObligations();
  }, []);

  const fetchObligations = async () => {
    try {
      const res = await fetch('/api/calendar-obligations');
      if (!res.ok) throw new Error('Failed to fetch obligations');
      
      const data = await res.json();
      setDateGroups(data.dateGroups || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentClick = (doc: any) => {
    if (onDocumentClick) {
      onDocumentClick(doc.document_id, doc.document_title);
    }
  };

  const groupByMonth = () => {
    const monthMap = new Map<string, DateGroup[]>();
    
    dateGroups.forEach(group => {
      const date = new Date(group.date + 'T00:00:00');
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, []);
      }
      monthMap.get(monthKey)?.push(group);
    });
    
    return Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const getEventsForDate = (year: number, month: number, day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateGroups.find(g => g.date === dateStr);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const today = new Date();
  const isToday = (year: number, month: number, day: number) => {
    return today.getFullYear() === year && 
           today.getMonth() === month && 
           today.getDate() === day;
  };

  if (loading) {
    return (
      <Card className="border-2 sm:border-neutral-300 shadow-md rounded-2xl sm:rounded-3xl bg-white">
        <CardHeader className="border-b border-neutral-200 bg-white p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-neutral-900 text-base sm:text-lg">
            <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-[#7B9B7B]" />
            Compliance Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8 sm:py-12 p-4">
          <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-[#7B9B7B]" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-2 sm:border-neutral-300 shadow-md rounded-2xl sm:rounded-3xl bg-white">
        <CardHeader className="border-b border-neutral-200 bg-white p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-neutral-900 text-base sm:text-lg">
            <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-[#7B9B7B]" />
            Compliance Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <p className="text-rose-600 font-medium text-sm">Error: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (dateGroups.length === 0) {
    return (
      <Card className="border-2 sm:border-neutral-300 shadow-md rounded-2xl sm:rounded-3xl bg-white">
        <CardHeader className="border-b border-neutral-200 bg-white p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-neutral-900 text-base sm:text-lg">
            <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-[#7B9B7B]" />
            Compliance Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 sm:py-12 p-4 sm:p-6">
          <div className="text-center space-y-2">
            <p className="text-neutral-600 font-medium text-sm">No upcoming commencement dates yet.</p>
            <p className="text-xs sm:text-sm text-neutral-500">Upload a regulatory document and add commencement dates!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const monthGroups = groupByMonth();
  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);
  const monthName = currentDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  return (
    <Card className="border-2 sm:border-neutral-300 shadow-md rounded-2xl sm:rounded-3xl bg-white">
      <CardHeader className="border-b-2 border-neutral-300 bg-white p-3 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 sm:gap-3 text-neutral-900 text-base sm:text-lg">
            <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-[#7B9B7B] flex-shrink-0" />
            <span className="whitespace-nowrap">Compliance Calendar</span>
          </CardTitle>
          
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-0.5 sm:gap-1 bg-neutral-100 rounded-lg sm:rounded-xl p-0.5 sm:p-1 border border-neutral-300">
              <Button
                onClick={() => setViewMode('timeline')}
                variant={viewMode === 'timeline' ? 'default' : 'ghost'}
                size="sm"
                className={`rounded-md sm:rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ${viewMode === 'timeline' ? 'bg-[#7B9B7B] text-white' : 'text-neutral-600'}`}
              >
                <List className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                <span className="hidden sm:inline">Timeline</span>
              </Button>
              <Button
                onClick={() => setViewMode('month')}
                variant={viewMode === 'month' ? 'default' : 'ghost'}
                size="sm"
                className={`rounded-md sm:rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ${viewMode === 'month' ? 'bg-[#7B9B7B] text-white' : 'text-neutral-600'}`}
              >
                <Grid3x3 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                <span className="hidden sm:inline">Month</span>
              </Button>
            </div>
            
            {viewMode === 'month' && (
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  onClick={prevMonth}
                  variant="outline"
                  size="sm"
                  className="rounded-lg sm:rounded-xl border-neutral-300 h-8 w-8 sm:h-9 sm:w-9 p-0"
                >
                  <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
                <span className="text-xs sm:text-sm font-semibold text-neutral-800 min-w-[100px] sm:min-w-[140px] text-center">
                  {monthName}
                </span>
                <Button
                  onClick={nextMonth}
                  variant="outline"
                  size="sm"
                  className="rounded-lg sm:rounded-xl border-neutral-300 h-8 w-8 sm:h-9 sm:w-9 p-0"
                >
                  <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 sm:pt-6 p-3 sm:p-6">
        {viewMode === 'timeline' ? (
          <div className="space-y-4 sm:space-y-6">
            {monthGroups.map(([monthKey, groups]) => {
              const [yearStr, monthStr] = monthKey.split('-');
              const monthDate = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
              const displayMonth = monthDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
              
              return (
                <div key={monthKey} className="border-2 border-neutral-300 rounded-xl sm:rounded-2xl p-3 sm:p-5 bg-gradient-to-br from-white to-neutral-50 shadow-sm">
                  <h3 className="text-base sm:text-lg font-bold text-neutral-900 mb-3 sm:mb-4 pb-2 border-b-2 border-neutral-200">
                    {displayMonth}
                  </h3>
                  <div className="space-y-2 sm:space-y-3">
                    {groups.map((group) => {
                      const date = new Date(group.date + 'T00:00:00');
                      const dayNum = date.getDate();
                      const dayName = date.toLocaleDateString('en-AU', { weekday: 'short' });
                      
                      return (
                        <div
                          key={group.date}
                          className="border-2 border-neutral-200 rounded-xl p-3 sm:p-4 bg-white hover:shadow-md transition-all"
                        >
                          <div className="flex items-start gap-3 sm:gap-4">
                            <div className="flex flex-col items-center justify-center bg-gradient-to-br from-[#7B9B7B] to-[#6B8B6B] text-white rounded-lg sm:rounded-xl p-2 sm:p-3 min-w-[50px] sm:min-w-[70px] shadow-md">
                              <div className="text-xl sm:text-2xl font-bold">{dayNum}</div>
                              <div className="text-[10px] sm:text-xs font-medium uppercase">{dayName}</div>
                            </div>
                            
                            <div className="flex-1 space-y-1.5 sm:space-y-2 min-w-0">
                              {/* User-added dates with custom descriptions - Purple */}
                              {group.documents.map((doc, idx) => (
                                <div
                                  key={idx}
                                  onClick={() => handleDocumentClick(doc)}
                                  className="bg-purple-50 border-2 border-purple-200 text-purple-900 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-medium cursor-pointer hover:bg-purple-100 hover:border-purple-400 transition-all hover:shadow-md text-xs sm:text-sm break-words"
                                  title="Click to view obligations - User-specified date"
                                >
                                  📄 {doc.description}
                                </div>
                              ))}
                              
                              {/* Auto-extracted dates without user descriptions - Orange/Amber */}
                              {group.documents.length === 0 && group.obligations.length > 0 && (
                                <div
                                  onClick={() => handleDocumentClick({
                                    document_id: group.obligations[0].document_id,
                                    document_title: group.obligations[0].document_title,
                                    description: group.obligations[0].document_title
                                  })}
                                  className="bg-amber-50 border-2 border-amber-300 text-amber-900 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-medium cursor-pointer hover:bg-amber-100 hover:border-amber-500 transition-all hover:shadow-md text-xs sm:text-sm break-words"
                                  title="Click to view obligations - Auto-detected date (not manually specified)"
                                >
                                  ⚡ {group.obligations[0].document_title}
                                </div>
                              )}
                              

                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-[10px] sm:text-sm font-bold text-neutral-700 py-1.5 sm:py-2 bg-neutral-100 rounded-md sm:rounded-lg border border-neutral-300">
                {day}
              </div>
            ))}
            
            {Array.from({ length: startingDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const events = getEventsForDate(year, month, day);
              const isTodayDate = isToday(year, month, day);
              
              return (
                <div
                  key={day}
                  className={`aspect-square border-2 rounded-lg sm:rounded-xl p-1 sm:p-2 relative ${
                    isTodayDate ? 'border-[#7B9B7B] bg-[#E8F5E8] shadow-md' : 'border-neutral-300 bg-white'
                  } ${events ? 'cursor-pointer hover:shadow-lg hover:border-[#7B9B7B] transition-all' : ''}`}
                >
                  <div className={`text-[10px] sm:text-sm font-bold ${isTodayDate ? 'text-[#7B9B7B]' : 'text-neutral-800'}`}>
                    {day}
                  </div>
                  
                  {events && (
                    <div className="mt-0.5 sm:mt-1 space-y-0.5 sm:space-y-1">
                      {/* User-added dates - Purple */}
                      {events.documents.slice(0, 2).map((doc, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleDocumentClick(doc)}
                          className="text-[8px] sm:text-[10px] bg-purple-100 text-purple-800 px-1 sm:px-1.5 py-0.5 rounded border border-purple-300 truncate font-medium hover:bg-purple-200 cursor-pointer transition-colors"
                          title={`${doc.description} - Click to view obligations`}
                        >
                          {doc.description.substring(0, 15)}...
                        </div>
                      ))}
                      
                      {/* Auto-detected dates - Amber (only if no user docs) */}
                      {events.documents.length === 0 && events.obligations && events.obligations.length > 0 && (
                        <div
                          onClick={() => handleDocumentClick({
                            document_id: events.obligations[0].document_id,
                            document_title: events.obligations[0].document_title,
                            description: events.obligations[0].document_title
                          })}
                          className="text-[8px] sm:text-[10px] bg-amber-100 text-amber-800 px-1 sm:px-1.5 py-0.5 rounded border border-amber-300 truncate font-medium hover:bg-amber-200 cursor-pointer transition-colors"
                          title={`${events.obligations[0].document_title} - Auto-detected date`}
                        >
                          ⚡{events.obligations[0].document_title.substring(0, 12)}...
                        </div>
                      )}
                      
                      {events.documents.length > 2 && (
                        <div className="text-[7px] sm:text-[9px] text-neutral-600 px-1 font-semibold">
                          +{events.documents.length - 2} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
