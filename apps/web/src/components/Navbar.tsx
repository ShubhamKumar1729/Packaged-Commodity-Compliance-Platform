import React, { useEffect, useState } from 'react';
import { LayoutDashboard, ScanLine, History, BookOpen, Menu, X, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { ThemeToggle } from './ThemeToggle';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  systemReady: boolean;
}

// Identical destinations and ids to the original implementation.
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'scan', label: 'New scan', icon: ScanLine },
  { id: 'history', label: 'History', icon: History },
  { id: 'rules', label: 'Rules', icon: BookOpen },
];

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, systemReady }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [activeTab]);

  const go = (id: string) => {
    setActiveTab(id);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-gov-850/95 backdrop-blur-sm border-b border-slate-800">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-4">
          {/* Brand */}
          <button
            onClick={() => go('dashboard')}
            className="flex items-center gap-2.5 shrink-0 group"
            aria-label="PackSure home"
          >
            <span className="w-7 h-7 rounded-md bg-gold-500 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-white dark:text-gov-950" aria-hidden="true" />
            </span>
            <span className="text-left leading-tight hidden sm:block">
              <span className="block text-sm font-semibold text-slate-100 tracking-tight">
                PackSure
              </span>
              <span className="block text-2xs text-slate-500">Compliance platform</span>
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1" aria-label="Main">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => go(id)}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium transition-colors',
                    active
                      ? 'bg-gov-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-gov-800/60',
                  )}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Right cluster */}
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="hidden lg:inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-slate-800 bg-gov-900 text-2xs"
              title={systemReady ? 'Verification engine is ready' : 'Connecting to verification engine'}
            >
              <span
                className={clsx(
                  'w-1.5 h-1.5 rounded-full',
                  systemReady ? 'bg-emerald-500' : 'bg-amber-500',
                )}
                aria-hidden="true"
              />
              <span className="text-slate-400">
                {systemReady ? 'Engine ready' : 'Connecting'}
              </span>
            </span>

            <ThemeToggle />

            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md border border-slate-700 bg-gov-850 text-slate-300 hover:bg-gov-800 transition-colors"
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav
          className="md:hidden border-t border-slate-800 bg-gov-850 animate-slide-down"
          aria-label="Mobile"
        >
          <div className="px-3 py-2 space-y-0.5">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => go(id)}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                    active ? 'bg-gov-800 text-slate-100' : 'text-slate-400 hover:bg-gov-800/60',
                  )}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
            <div className="flex items-center gap-2 px-3 pt-2.5 pb-1 text-2xs text-slate-500 border-t border-slate-800 mt-1">
              <span
                className={clsx('w-1.5 h-1.5 rounded-full', systemReady ? 'bg-emerald-500' : 'bg-amber-500')}
                aria-hidden="true"
              />
              {systemReady ? 'Engine ready' : 'Connecting to engine'}
            </div>
          </div>
        </nav>
      )}
    </header>
  );
};
