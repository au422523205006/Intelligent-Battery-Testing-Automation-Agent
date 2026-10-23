import React from 'react';
import type { NavTab } from './Sidebar';
import { RefreshCw, Bot } from 'lucide-react';

interface Props {
  activeTab: NavTab;
  onRefresh: () => void;
  isRefreshing: boolean;
  primaryLLM?: string;
  hardwareStatus?: string;
}

export const Header: React.FC<Props> = ({
  activeTab,
  onRefresh,
  isRefreshing,
  primaryLLM = 'GROQ',
  hardwareStatus = 'DISCONNECTED',
}) => {
  const titles: Record<NavTab, { title: string; subtitle: string }> = {
    overview: {
      title: 'Battery Monitoring Dashboard',
      subtitle: 'Live Telemetry, Simulation Model, and Pack Health Diagnostics',
    },
    tests: {
      title: 'uPowerful BST & BettaTeQ Tests',
      subtitle: 'Automated Lab Test Ingestion (.main binaries) and Session History',
    },
    charts: {
      title: 'Deep Test Analytics',
      subtitle: 'Time-Series Voltage, Current, Temperature, and Energy Profiles',
    },
    simulator: {
      title: 'Battery Test Simulator',
      subtitle: 'Controlled Charge & Discharge Cycling with Excursion Alerts',
    },
    chat: {
      title: 'AI Multi-LLM Assistant',
      subtitle: 'Natural Language Agent with Automatic Fallback and Data Provenance',
    },
    health: {
      title: 'System & Multi-LLM Health',
      subtitle: 'Provider Readiness, Fallback Order, and uPowerful Bridge Diagnostics',
    },
  };

  const current = titles[activeTab];

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
      <div>
        <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
          {current.title}
        </h2>
        <p className="text-xs text-slate-400">{current.subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Hardware Status Pill */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700/60 text-xs">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-slate-400 font-medium">BMS:</span>
          <span className="text-amber-400 font-mono font-semibold">{hardwareStatus}</span>
        </div>

        {/* Primary LLM Pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-950/60 border border-blue-800/50 text-xs text-blue-300">
          <Bot className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-slate-400">LLM:</span>
          <span className="font-semibold text-blue-300">{primaryLLM}</span>
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all disabled:opacity-50"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>
    </header>
  );
};
