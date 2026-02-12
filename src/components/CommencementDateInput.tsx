'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar, Plus, Trash2, Save, Loader2, X } from 'lucide-react';

interface CommencementDate {
  date: string;
  description: string;
}

interface Props {
  documentId: string;
  documentTitle: string;
  onSaved?: () => void;
  onSkip?: () => void;
}

export default function CommencementDateInput({ documentId, documentTitle, onSaved, onSkip }: Props) {
  const [dates, setDates] = useState<CommencementDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    autoExtractDates();
  }, [documentId]);

  const autoExtractDates = async () => {
    setLoading(true);
    setExtracting(true);
    try {
      const res = await fetch('/api/extract-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });
      
      const data = await res.json();
      
      if (data.dates && data.dates.length > 0) {
        setDates(data.dates);
        setMessage(`✨ Found ${data.dates.length} commencement date${data.dates.length !== 1 ? 's' : ''}! Review and save.`);
      } else {
        setDates([{ date: '', description: `${documentTitle} - Main commencement` }]);
        setMessage('No dates found automatically. Add manually or skip.');
      }
    } catch (err) {
      console.error('Error extracting dates:', err);
      setDates([{ date: '', description: `${documentTitle} - Main commencement` }]);
      setMessage('Could not auto-extract dates. Add manually or skip.');
    } finally {
      setLoading(false);
      setExtracting(false);
    }
  };

  const addDate = () => {
    setDates([...dates, { date: '', description: `${documentTitle} - ` }]);
  };

  const removeDate = (index: number) => {
    setDates(dates.filter((_, i) => i !== index));
  };

  const updateDate = (index: number, field: 'date' | 'description', value: string) => {
    const updated = [...dates];
    updated[index][field] = value;
    setDates(updated);
  };

  const saveDates = async () => {
    const validDates = dates.filter(d => d.date && d.description);
    
    if (validDates.length === 0) {
      setMessage('⚠️ Please add at least one date with description, or click Skip');
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/document-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, dates: validDates }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save dates');
      }

      setMessage(`✅ Saved ${validDates.length} commencement date${validDates.length !== 1 ? 's' : ''}! Check calendar above.`);
      
      if (onSaved) {
        onSaved();
      }
    } catch (err: any) {
      setMessage(`❌ Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    }
  };

  if (loading) {
    return (
      <Card className="border-2 sm:border-neutral-200 shadow-sm rounded-2xl sm:rounded-3xl bg-white">
        <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12 gap-3 p-4">
          <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-[#7B9B7B]" />
          <p className="text-xs sm:text-sm text-neutral-600 text-center px-2">
            {extracting ? 'AI extracting commencement dates...' : 'Loading...'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 sm:border-neutral-200 shadow-sm rounded-2xl sm:rounded-3xl bg-white">
      <CardHeader className="bg-gradient-to-r from-[#E8EDE8] to-[#EEF0EE] border-b border-neutral-200 pb-4 sm:pb-6 p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-neutral-800 text-base sm:text-lg">
          <Calendar className="h-5 w-5 text-[#7B9B7B] flex-shrink-0" />
          Commencement Dates (Optional)
        </CardTitle>
        <CardDescription className="text-neutral-600 mt-1 sm:mt-2 text-xs sm:text-sm">
          Review AI-extracted dates, add manually, or skip. These will appear in your compliance calendar.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 sm:pt-6 space-y-3 sm:space-y-4 p-3 sm:p-6">
        {message && (
          <div className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm ${
            message.startsWith('✅') || message.startsWith('✨') 
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
              : message.startsWith('⚠️') || message.startsWith('❌')
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {message}
          </div>
        )}

        {dates.map((d, index) => (
          <div key={index} className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2 sm:gap-3">
            <div className="flex-1 space-y-2">
              <input
                type="date"
                value={d.date}
                onChange={(e) => updateDate(index, 'date', e.target.value)}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-neutral-200 rounded-xl sm:rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#7B9B7B]"
              />
              <input
                type="text"
                value={d.description}
                onChange={(e) => updateDate(index, 'description', e.target.value)}
                placeholder="e.g., Final determination - Main rule commencement"
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-neutral-200 rounded-xl sm:rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#7B9B7B]"
              />
            </div>
            {dates.length > 1 && (
              <Button
                onClick={() => removeDate(index)}
                variant="outline"
                size="sm"
                className="mt-0 sm:mt-1 border-red-200 text-red-600 hover:bg-red-50 rounded-lg sm:rounded-xl h-auto py-2 sm:py-1.5"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 pt-2">
          <Button
            onClick={addDate}
            variant="outline"
            className="border-[#7B9B7B] text-[#7B9B7B] hover:bg-[#E8EDE8] rounded-xl sm:rounded-2xl text-xs sm:text-sm py-5 sm:py-2.5"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Another Date
          </Button>

          <Button
            onClick={saveDates}
            disabled={saving}
            className="bg-[#7B9B7B] hover:bg-[#6B8B6B] text-white rounded-xl sm:rounded-2xl text-xs sm:text-sm py-5 sm:py-2.5"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save to Calendar
          </Button>

          <Button
            onClick={handleSkip}
            variant="outline"
            className="border-neutral-300 text-neutral-600 hover:bg-neutral-50 rounded-xl sm:rounded-2xl text-xs sm:text-sm py-5 sm:py-2.5"
          >
            <X className="h-4 w-4 mr-2" />
            Skip for Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
