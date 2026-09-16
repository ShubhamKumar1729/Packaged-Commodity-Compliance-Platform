import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardView } from './pages/DashboardView';
import { NewScanView } from './pages/NewScanView';
import { RulesView } from './pages/RulesView';
import { HistoryView } from './pages/HistoryView';
import { ScanDetailView } from './pages/ScanDetailView';
import { api } from './services/api';
import { ThemeProvider } from './theme/ThemeProvider';
import { PiaAssistant } from './components/PiaAssistant';

const AppShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [systemReady, setSystemReady] = useState<boolean>(false);
  const [mockOcr, setMockOcr] = useState<boolean>(false);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);

  useEffect(() => {
    async function checkSystem() {
      try {
        const ready = await api.getReadiness();
        setSystemReady(ready.status === 'ready');
        // Reported by the API process itself, so it reflects the server's
        // configuration rather than any local shell or CLI environment.
        setMockOcr(ready.using_mock_ocr === true);
      } catch (err) {
        setSystemReady(false);
      }
    }
    checkSystem();
    const interval = setInterval(checkSystem, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleScanCreated = (scanId: string) => {
    setSelectedScanId(scanId);
  };

  const handleViewScan = (scanId: string) => {
    setSelectedScanId(scanId);
  };

  const handleBackToLedger = () => {
    setSelectedScanId(null);
  };

  const handleTabChange = (tab: string) => {
    setSelectedScanId(null);
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-gov-900 text-slate-100 flex flex-col font-sans">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-2 focus:rounded-md focus:bg-gold-500 focus:text-white dark:focus:text-gov-950 focus:text-sm"
      >
        Skip to content
      </a>

      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        systemReady={systemReady}
      />

      {mockOcr && (
        <div
          role="alert"
          className="bg-rose-600 text-white dark:text-gov-950 px-4 sm:px-6 lg:px-8 py-2.5"
        >
          <p className="max-w-[1400px] mx-auto text-xs font-medium">
            <span className="font-semibold">Mock OCR engine active.</span>{' '}
            This server returns fixed sample text instead of reading your images —
            every scan result is simulated. Set{' '}
            <code className="font-mono">OCR_PROVIDER=paddleocr</code> and restart the
            API server.
          </p>
        </div>
      )}

      <main
        id="main-content"
        className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-7"
      >
        {selectedScanId ? (
          <ScanDetailView
            scanId={selectedScanId}
            onBack={handleBackToLedger}
          />
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView
                onStartNewScan={() => handleTabChange('scan')}
                onViewScan={handleViewScan}
              />
            )}
            {activeTab === 'scan' && (
              <NewScanView onScanCreated={handleScanCreated} />
            )}
            {activeTab === 'history' && (
              <HistoryView onViewScan={handleViewScan} />
            )}
            {activeTab === 'rules' && (
              <RulesView />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-800 mt-6">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-2xs text-slate-500">
            PackSure — Legal Metrology (Packaged Commodities) Rules, 2011 &amp; FSSR 2020
          </p>
          <p className="text-2xs text-slate-500">
            AI extracts and measures. Deterministic rules decide compliance.
          </p>
        </div>
      </footer>

      <PiaAssistant scanId={selectedScanId} />
    </div>
  );
};

export const App: React.FC = () => (
  <ThemeProvider>
    <AppShell />
  </ThemeProvider>
);

export default App;
