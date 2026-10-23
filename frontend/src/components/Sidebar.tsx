import React from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  LineChart,
  Cpu,
  Bot,
  Activity,
  Zap,
  ShieldAlert,
} from 'lucide-react';

export type NavTab = 'overview' | 'tests' | 'charts' | 'simulator' | 'chat' | 'health';

interface Props {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  unseenAlertsCount?: number;
}

export const Sidebar: React.FC<Props> = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'overview' as NavTab, label: 'Overview', icon: LayoutDashboard },
    { id: 'tests' as NavTab, label: 'uPowerful Tests', icon: FileSpreadsheet },
    { id: 'charts' as NavTab, label: 'Test Analytics', icon: LineChart },
    { id: 'simulator' as NavTab, label: 'Simulator Workbench', icon: Cpu },
    { id: 'chat' as NavTab, label: 'AI Assistant', icon: Bot },
    { id: 'health' as NavTab, label: 'System & LLMs', icon: Activity },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white">
          <Zap className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
            EV Battery Agent
          </h1>
          <span className="text-[11px] font-mono text-cyan-400 font-medium">BettaTeQ & uPowerful BST</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Hardware Safety Notice */}
      <div className="p-4 m-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
        <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-1">
          <ShieldAlert className="w-4 h-4" />
          <span>Safety Interlock</span>
        </div>
        <p className="text-slate-400 text-[11px] leading-relaxed">
          Physical BMS hardware is disconnected. Hardware control commands are locked.
        </p>
      </div>
    </aside>
  );
};
