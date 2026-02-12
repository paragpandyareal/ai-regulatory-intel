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

export default function ComplianceCalendar() {
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

  // Group dates by month
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
      <Card className="border-neutral-300 shadow-md rounded-3xl bg-white">
        <CardHeader className="border-b border-neutral-200 bg-white">
          <CardTitle className="flex items-center gap-2 text-neutral-900">
            <Calendar className="h-6 w-6 text-[#7B9B7B]" />
            Compliance Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#7B9B7B]" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-neutral-300 shadow-md rounded-3xl bg-white">
        <CardHeader className="border-b border-neutral-200 bg-white">
          <CardTitle className="flex items-center gap-2 text-neutral-900">
            <Calendar className="h-6 w-6 text-[#7B9B7B]" />
            Compliance Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-rose-600 font-medium">Error: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (dateGroups.length === 0) {
    return (
      <Card className="border-neutral-300 shadow-md rounded-3xl bg-white">
        <CardHeader className="border-b border-neutral-200 bg-white">
          <CardTitle className="flex items-center gap-2 text-neutral-900">
            <Calendar className="h-6 w-6 text-[#7B9B7B]" />
            Compliance Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="py-12">
          <div className="text-center space-y-2">
            <p className="text-neutral-600 font-medium">No upcoming commencement dates yet.</p>
            <p className="text-sm text-neutral-500">Upload a regulatory document and add commencement dates!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const monthGroups = groupByMonth();
  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);
  const monthName = currentDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  return (
    <Card className="border-neutral-300 shadow-md rounded-3xl bg-white">
      <CardHeader className="border-b-2 border-neutral-300 bg-white">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-neutral-900">
            <Calendar className="h-6 w-6 text-[#7B9B7B]" />
            Compliance Calendar
          </CardTitle>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-neutral-100 rounded-xl p-1 border border-neutral-300">
              <Button
                onClick={() => setViewMode('timeline')}
                variant={viewMode === 'timeline' ? 'default' : 'ghost'}
                size="sm"
                className={`rounded-lg ${viewMode === 'timeline' ? 'bg-[#7B9B7B] text-white' : 'text-neutral-600'}`}
              >
                <List className="h-4 w-4 mr-1" />
                Timeline
              </Button>
              <Button
                onClick={() => setViewMode('month')}
                variant={viewMode === 'month' ? 'default' : 'ghost'}
                size="sm"
                className={`rounded-lg ${viewMode === 'month' ? 'bg-[#7B9B7B] text-white' : 'text-neutral-600'}`}
              >
                <Grid3x3 className="h-4 w-4 mr-1" />
                Month
              </Button>
            </div>
            
            {viewMode === 'month' && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={prevMonth}
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-neutral-300"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold text-neutral-800 min-w-[140px] text-center">
                  {monthName}
                </span>
                <Button
                  onClick={nextMonth}
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-neutral-300"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {viewMode === 'timeline' ? (
          /* Timeline View - Show all months with regulations */
          <div className="space-y-6">
            {monthGroups.map(([monthKey, groups]) => {
              const [yearStr, monthStr] = monthKey.split('-');
              const monthDate = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
              const displayMonth = monthDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
              
              return (
                <div key={monthKey} className="border-2 border-neutral-300 rounded-2xl p-5 bg-gradient-to-br from-white to-neutral-50 shadow-sm">
                  <h3 className="text-lg font-bold text-neutral-900 mb-4 pb-2 border-b-2 border-neutral-200">
                    {displayMonth}
                  </h3>
                  <div className="space-y-3">
                    {groups.map((group) => {
                      const date = new Date(group.date + 'T00:00:00');
                      const dayNum = date.getDate();
                      const dayName = date.toLocaleDateString('en-AU', { weekday: 'short' });
                      
                      return (
                        <div
                          key={group.date}
                          className="border-2 border-neutral-200 rounded-xl p-4 bg-white hover:shadow-md transition-all cursor-pointer hover:border-[#7B9B7B]"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex flex-col items-center justify-center bg-gradient-to-br from-[#7B9B7B] to-[#6B8B6B] text-white rounded-xl p-3 min-w-[70px] shadow-md">
                              <div className="text-2xl font-bold">{dayNum}</div>
                              <div className="text-xs font-medium uppercase">{dayName}</div>
                            </div>
                            
                            <div className="flex-1 space-y-2">
                              {group.documents.map((doc, idx) => (
                                <div
                                  key={idx}
                                  className="bg-purple-50 border-2 border-purple-200 text-purple-900 px-4 py-2 rounded-xl font-medium"
                                >
                                  {doc.description}
                                </div>
                              ))}
                              
                              {group.obligations.length > 0 && (
                                <div className="flex gap-2 pt-1">
                                  {group.bindingCount > 0 && (
                                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border-2 border-red-300">
                                      {group.bindingCount} binding
                                    </span>
                                  )}
                                  {group.guidanceCount > 0 && (
                                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border-2 border-blue-300">
                                      {group.guidanceCount} guidance
                                    </span>
                                  )}
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
          /* Month Grid View */
          <div className="grid grid-cols-7 gap-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-sm font-bold text-neutral-700 py-2 bg-neutral-100 rounded-lg border border-neutral-300">
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
                  className={`aspect-square border-2 rounded-xl p-2 relative ${
                    isTodayDate ? 'border-[#7B9B7B] bg-[#E8F5E8] shadow-md' : 'border-neutral-300 bg-white'
                  } ${events ? 'cursor-pointer hover:shadow-lg hover:border-[#7B9B7B] transition-all' : ''}`}
                >
                  <div className={`text-sm font-bold ${isTodayDate ? 'text-[#7B9B7B]' : 'text-neutral-800'}`}>
                    {day}
                  </div>
                  
                  {events && (
                    <div className="mt-1 space-y-1">
                      {events.documents.slice(0, 2).map((doc, idx) => (
                        <div
                          key={idx}
                          className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded border border-purple-300 truncate font-medium"
                          title={doc.description}
                        >
                          {doc.description.substring(0, 15)}...
                        </div>
                      ))}
                      {events.documents.length > 2 && (
                        <div className="text-[9px] text-neutral-600 px-1 font-semibold">
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
