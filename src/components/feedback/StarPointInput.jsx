import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function StarPointInput({ value, onChange }) {
  const [inputVal, setInputVal] = useState(value != null ? String(value) : '');

  const handleInput = (e) => {
    const raw = e.target.value;
    setInputVal(raw);
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 5) {
      onChange(parsed);
    }
  };

  const filledWidth = Math.min(Math.max((value || 0) / 5, 0), 1) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 relative">
        {[1, 2, 3, 4, 5].map((s) => {
          const fill = Math.min(Math.max((value || 0) - (s - 1), 0), 1);
          return (
            <div key={s} className="relative w-7 h-7">
              <Star className="w-7 h-7 text-border absolute inset-0" />
              <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="w-7 h-7 fill-yellow-400 text-yellow-400" />
              </div>
            </div>
          );
        })}
        <span className="ml-2 text-sm font-semibold text-yellow-400">{value || 0}/5</span>
      </div>
      <Input
        type="number"
        min="0"
        max="5"
        step="0.1"
        value={inputVal}
        onChange={handleInput}
        placeholder="e.g. 3.8, 4, 4.3"
        className="bg-muted border-border w-40"
      />
    </div>
  );
}