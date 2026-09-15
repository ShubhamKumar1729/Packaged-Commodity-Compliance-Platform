import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';

export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { resolved, toggle } = useTheme();
  const nextLabel = resolved === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to ${nextLabel} theme`}
      aria-label={`Switch to ${nextLabel} theme`}
      className={
        'inline-flex items-center justify-center w-9 h-9 rounded-md border border-slate-700 ' +
        'bg-gov-850 text-slate-400 hover:text-slate-100 hover:bg-gov-800 transition-colors ' +
        (className ?? '')
      }
    >
      {resolved === 'dark' ? (
        <Sun className="w-4 h-4" aria-hidden="true" />
      ) : (
        <Moon className="w-4 h-4" aria-hidden="true" />
      )}
    </button>
  );
};
