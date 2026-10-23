import React, { useState, useEffect } from 'react';
import type { ProvidersResponse, UPowerfulStatus } from '../types';
import { fetchProviders, fetchUPowerfulStatus } from '../api';
import {
  Activity,
  Bot,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  ShieldCheck,
  ShieldAlert,
  Terminal,
} from 'lucide-react';

export const SystemHealth: React.FC = () => {
  const [providersData, setProvidersData] = useState<ProvidersResponse | null>(null);
  const [upowerfulData, setUPowerfulData] = useState<UPowerfulStatus | null>(null);

  useEffect(() => {
    Promise.all([fetchProviders(), fetchUPowerfulStatus()])
      .then(([prov, up]) => {
        setProvidersData(prov);
        setUPowerfulData(up);
      })
      .catch((err) => {
        console.error(err);
      });
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">System Architecture & Multi-LLM Routing Status</h3>
            <p className="text-xs text-slate-400">
              Priority failover engine, uPowerful BST 32-bit bridge status, and hardware disconnect interlocks.
            </p>
          </div>
        </div>
      </div>

      {/* Multi-LLM Providers Priority Pipeline */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-semibold text-white">Automatic Multi-LLM Fallback Priority Pipeline</h4>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Configured in <code className="text-cyan-400">.env</code> (Priority: 1 → 2 → 3 → 4 → 5)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {providersData?.providers.map((p, idx) => (
            <div
              key={p.id}
              className={`p-4 rounded-xl border flex flex-col justify-between ${
                p.configured
                  ? 'border-emerald-500/30 bg-emerald-950/20'
                  : 'border-slate-800 bg-slate-950/40 opacity-75'
              }`}
            >
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300">
                    Priority #{idx + 1}
                  </span>
                  {p.configured ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Configured</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Unconfigured</span>
                    </span>
                  )}
                </div>

                <h5 className="text-sm font-bold text-white mb-1 flex items-center gap-1.5">
                  {p.provider}
                  {p.is_primary && (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono font-bold">
                      Primary
                    </span>
                  )}
                </h5>

                <div className="text-xs text-slate-400 space-y-1 mt-2 font-mono text-[11px]">
                  <div className="truncate" title={p.model}>
                    Model: <span className="text-slate-200">{p.model}</span>
                  </div>
                  <div>
                    API Key: <span className="text-slate-500 font-mono">{p.configured ? '●●●●●●●● (Protected)' : 'None'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-500">
                {p.configured ? 'Ready for automatic routing' : 'Will be skipped during fallback'}
              </div>
            </div>
          ))}
        </div>

        {/* Deterministic Rule-Based Fallback Card */}
        <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-950/20 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold text-blue-300 block mb-0.5">
              Priority #5: Deterministic Rule-Based Fallback (safety-v1)
            </span>
            <p className="text-slate-300 leading-relaxed">
              If all configured cloud and local LLM providers are rate-limited, offline, or unconfigured, the router
              automatically falls back to deterministic safe local rule execution. No fabricated measurements or uncertified
              claims are ever emitted.
            </p>
          </div>
        </div>
      </div>

      {/* uPowerful BST Lab Connector Diagnostics */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-semibold text-white">uPowerful BST & BettaTeQ V5.2 Connector Diagnostics</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 block text-[11px] mb-1">Software Installation Directory</span>
            <span className="font-mono text-white text-[11px] break-all">
              {upowerfulData?.install_dir || 'Checking...'}
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 block text-[11px] mb-1">Active Test Data Repository</span>
            <span className="font-mono text-emerald-400 text-[11px] break-all">
              {upowerfulData?.data_dir || 'Checking...'}
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 block text-[11px] mb-1">.NET DataAnalyser Assembly</span>
            <span className={`font-mono text-[11px] font-bold ${upowerfulData?.dlls_present ? 'text-emerald-400' : 'text-rose-400'}`}>
              {upowerfulData?.dlls_present ? 'DataView.DataAnalyser.dll (Ready)' : 'Missing DLLs'}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-950/40 border border-slate-800 text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 text-slate-400 font-medium">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>32-bit Architecture Interoperability Guarantee</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Because uPowerful BST uses a 32-bit (x86) .NET assembly, 64-bit processes cannot load it directly. The EV Battery
            Agent utilizes a specialized interop bridge executing under{' '}
            <code className="text-cyan-400 font-mono">C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe</code> to parse
            binary <code className="text-cyan-400 font-mono">.main</code> test archives with complete data fidelity.
          </p>
        </div>
      </div>

      {/* Safety Interlock Summary */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <h4 className="text-sm font-semibold text-white">Hardware Safety Interlocks & Data Provenance Rules</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800 space-y-1">
            <span className="font-semibold text-amber-300 block">1. Physical BMS Disconnected</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Real hardware telemetry is offline. Control commands are strictly locked in mock mode to prevent accidental
              hardware triggering.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800 space-y-1">
            <span className="font-semibold text-cyan-300 block">2. Strict Data Provenance Enforcement</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              All telemetry is labeled: <code className="text-emerald-400 font-mono">IMPORTED_REPORT</code> for real lab tests,{' '}
              <code className="text-purple-400 font-mono">SIMULATED</code> for synthetic models, or{' '}
              <code className="text-amber-400 font-mono">STORED_UNVERIFIED</code> for uncertified logs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
