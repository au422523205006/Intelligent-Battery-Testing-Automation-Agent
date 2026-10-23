import React from 'react';
import type {
  BatteryTelemetry,
  PackSpec,
  TestSession,
  UPowerfulStatus,
} from '../types';
import { DataProvenanceBadge } from './DataProvenanceBadge';
import {
  Zap,
  Gauge,
  Thermometer,
  BatteryCharging,
  Cpu,
  FileSpreadsheet,
  ArrowRight,
  ShieldAlert,
  Download,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import { getReportDownloadUrl } from '../api';

interface Props {
  telemetry: BatteryTelemetry;
  packSpec: PackSpec;
  latestTests: TestSession[];
  upowerfulStatus: UPowerfulStatus | null;
  onSyncUPowerful: () => void;
  isSyncing: boolean;
  onSelectTest: (testId: number) => void;
  onNavigateToTab: (tab: any) => void;
}

export const Overview: React.FC<Props> = ({
  telemetry,
  packSpec,
  latestTests,
  upowerfulStatus,
  onSyncUPowerful,
  isSyncing,
  onSelectTest,
  onNavigateToTab,
}) => {
  const nominalEnergyKwh = (packSpec.nominal_voltage * packSpec.capacity_ah) / 1000.0;

  return (
    <div className="space-y-6">
      {/* Hardware Disconnected Notification Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 flex items-start gap-3.5 shadow-sm">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-amber-300 text-sm">Hardware Disconnected Notice</span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-mono font-bold">
              SAFE MODE
            </span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            The physical BMS hardware is disconnected. Displayed telemetry values originate from either the software
            simulation model (<code className="text-purple-300 font-mono">SIMULATED</code>) or real imported laboratory test
            records (<code className="text-emerald-300 font-mono">IMPORTED_REPORT</code>). Live hardware commands are disabled.
          </p>
        </div>
      </div>

      {/* 4 Primary Telemetry Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Voltage Card */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-cyan-400" /> Voltage
            </span>
            <DataProvenanceBadge provenance={telemetry.provenance} size="sm" showLabel={false} />
          </div>
          <div className="my-2">
            <span className="text-3xl font-bold font-mono text-white tracking-tight">
              {telemetry.voltage ? telemetry.voltage.toFixed(2) : '--'}
            </span>
            <span className="text-slate-400 text-sm ml-1.5 font-medium">V</span>
          </div>
          <div className="text-[11px] text-slate-500 flex justify-between border-t border-slate-800/80 pt-2">
            <span>Nominal: {packSpec.nominal_voltage} V</span>
            <span className="text-slate-400 font-mono">{telemetry.provenance}</span>
          </div>
        </div>

        {/* Current Card */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-blue-400" /> Current
            </span>
            <DataProvenanceBadge provenance={telemetry.provenance} size="sm" showLabel={false} />
          </div>
          <div className="my-2">
            <span className={`text-3xl font-bold font-mono tracking-tight ${telemetry.current < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {telemetry.current !== undefined ? telemetry.current.toFixed(2) : '--'}
            </span>
            <span className="text-slate-400 text-sm ml-1.5 font-medium">A</span>
          </div>
          <div className="text-[11px] text-slate-500 flex justify-between border-t border-slate-800/80 pt-2">
            <span>Status: {telemetry.current > 0 ? 'Charging' : telemetry.current < 0 ? 'Discharging' : 'Idle'}</span>
            <span className="text-slate-400 font-mono">{telemetry.provenance}</span>
          </div>
        </div>

        {/* Temperature Card */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Thermometer className="w-4 h-4 text-orange-400" /> Temperature
            </span>
            <DataProvenanceBadge provenance={telemetry.provenance} size="sm" showLabel={false} />
          </div>
          <div className="my-2">
            <span className="text-3xl font-bold font-mono text-white tracking-tight">
              {telemetry.temperature ? telemetry.temperature.toFixed(1) : '--'}
            </span>
            <span className="text-slate-400 text-sm ml-1.5 font-medium">°C</span>
          </div>
          <div className="text-[11px] text-slate-500 flex justify-between border-t border-slate-800/80 pt-2">
            <span>Limit: &lt; 45.0 °C</span>
            <span className="text-slate-400 font-mono">{telemetry.provenance}</span>
          </div>
        </div>

        {/* State of Charge Card */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <BatteryCharging className="w-4 h-4 text-emerald-400" /> Est. SOC
            </span>
            <DataProvenanceBadge provenance={telemetry.provenance} size="sm" showLabel={false} />
          </div>
          <div className="my-2">
            <span className="text-3xl font-bold font-mono text-white tracking-tight">
              {telemetry.soc !== undefined ? telemetry.soc.toFixed(1) : '--'}
            </span>
            <span className="text-slate-400 text-sm ml-1.5 font-medium">%</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, telemetry.soc || 0))}%` }}
            />
          </div>
        </div>
      </div>

      {/* uPowerful BST Lab Integration & Pack Specifications Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* uPowerful BST Widget */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">uPowerful BST & BettaTeQ Integration</h3>
                  <p className="text-xs text-slate-400">Automated retrieval of battery testing laboratory data</p>
                </div>
              </div>
              <button
                onClick={onSyncUPowerful}
                disabled={isSyncing}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Scanning & Ingesting...' : 'Sync Lab Tests'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
              <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">Detected .main Files</span>
                <span className="text-xl font-bold font-mono text-white">
                  {upowerfulStatus ? upowerfulStatus.detected_files_count : '--'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">Synced In Database</span>
                <span className="text-xl font-bold font-mono text-emerald-400">
                  {upowerfulStatus ? upowerfulStatus.synced_tests_count : '--'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">.NET 32-bit Bridge</span>
                <span className={`text-xs font-semibold ${upowerfulStatus?.bridge_available ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {upowerfulStatus?.bridge_available ? 'ACTIVE (SysWOW64)' : 'OFFLINE'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">Last Synchronized</span>
                <span className="text-[11px] font-mono text-slate-300 truncate block" title={upowerfulStatus?.last_sync_time || ''}>
                  {upowerfulStatus?.last_sync_time ? upowerfulStatus.last_sync_time.split('T')[1]?.slice(0, 8) || 'Done' : 'Pending'}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="truncate">Data Path: {upowerfulStatus?.data_dir || 'Scanning...'}</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
            <span className="text-slate-400">View real voltage, capacity, and energy curves in the Test Explorer</span>
            <button
              onClick={() => onNavigateToTab('tests')}
              className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 transition-all"
            >
              <span>Explore All Lab Tests</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Pack Specifications Card */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Pack Specifications</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Pack Designation</span>
                <span className="font-semibold text-white">{packSpec.name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Cell Chemistry</span>
                <span className="font-semibold text-white">{packSpec.chemistry}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Nominal Voltage</span>
                <span className="font-mono text-white">{packSpec.nominal_voltage} V</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Rated Capacity</span>
                <span className="font-mono text-white">{packSpec.capacity_ah} Ah</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Nominal Energy</span>
                <span className="font-mono text-cyan-400 font-bold">{nominalEnergyKwh.toFixed(1)} kWh</span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-2.5 rounded-lg bg-blue-950/20 border border-blue-900/40 text-[11px] text-blue-300">
            Nominal energy calculated from voltage and Ah ratings: <code className="font-mono">{packSpec.nominal_voltage} V × {packSpec.capacity_ah} Ah = {nominalEnergyKwh * 1000} Wh</code>.
          </div>
        </div>
      </div>

      {/* Recent Laboratory Test Sessions List */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Recent Test Sessions</h3>
            <p className="text-xs text-slate-400">Lab test records imported from uPowerful BST & software simulator</p>
          </div>
          <button
            onClick={() => onNavigateToTab('tests')}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-medium">
                <th className="py-2.5 px-3">Session</th>
                <th className="py-2.5 px-3">Test File / Name</th>
                <th className="py-2.5 px-3">Provenance</th>
                <th className="py-2.5 px-3">Procedure</th>
                <th className="py-2.5 px-3">Max Voltage</th>
                <th className="py-2.5 px-3">Capacity (Ah)</th>
                <th className="py-2.5 px-3">Records</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {latestTests.slice(0, 5).map((test) => (
                <tr key={test.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-300">#{test.id}</td>
                  <td className="py-2.5 px-3 font-medium text-white max-w-[200px] truncate" title={test.test_name}>
                    {test.test_name}
                  </td>
                  <td className="py-2.5 px-3">
                    <DataProvenanceBadge provenance={test.provenance} size="sm" />
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">{test.procedure_name || 'Standard'}</td>
                  <td className="py-2.5 px-3 font-mono text-cyan-400">
                    {test.max_voltage ? `${test.max_voltage.toFixed(2)} V` : '--'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">
                    {test.capacity_ah !== undefined ? `${test.capacity_ah.toFixed(3)} Ah` : '--'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-400">{test.total_records || 0}</td>
                  <td className="py-2.5 px-3 text-right space-x-2">
                    <button
                      onClick={() => onSelectTest(test.id)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-medium transition-all"
                    >
                      Inspect
                    </button>
                    <a
                      href={getReportDownloadUrl(test.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-all"
                      title="Download PDF Report"
                    >
                      <Download className="w-3 h-3" />
                      <span>PDF</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
