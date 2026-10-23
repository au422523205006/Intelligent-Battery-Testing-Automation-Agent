import React, { useState } from 'react';
import type { TestSession } from '../types';
import { DataProvenanceBadge } from './DataProvenanceBadge';
import { getReportDownloadUrl, uploadUPowerfulFile } from '../api';
import {
  Search,
  Filter,
  FileSpreadsheet,
  Download,
  LineChart,
  RefreshCw,
  Upload,
  CheckCircle2,
  Clock,
  Layers,
  Thermometer,
  Zap,
  Gauge,
} from 'lucide-react';

interface Props {
  tests: TestSession[];
  selectedTest: TestSession | null;
  onSelectTest: (testId: number) => void;
  onSyncUPowerful: () => void;
  isSyncing: boolean;
  onViewCharts: (testId: number) => void;
  onRefreshTests: () => void;
}

export const TestDashboard: React.FC<Props> = ({
  tests,
  selectedTest,
  onSelectTest,
  onSyncUPowerful,
  isSyncing,
  onViewCharts,
  onRefreshTests,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProvenance, setSelectedProvenance] = useState<string>('ALL');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Filter tests
  const filteredTests = tests.filter((t) => {
    const matchesSearch =
      t.test_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.procedure_name && t.procedure_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.batch_no && t.batch_no.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesProv = selectedProvenance === 'ALL' || t.provenance === selectedProvenance;
    return matchesSearch && matchesProv;
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus('Importing file via 32-bit bridge...');
    try {
      const res = await uploadUPowerfulFile(file);
      setUploadStatus(`Successfully imported: ${res.detail.test_name} (#${res.session_id})`);
      onRefreshTests();
      onSelectTest(res.session_id);
    } catch (err: any) {
      setUploadStatus(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar: Search, Filter, Sync & Upload */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* Search & Filter */}
        <div className="flex flex-1 flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search tests, procedures, batch numbers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedProvenance}
              onChange={(e) => setSelectedProvenance(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Provenances</option>
              <option value="IMPORTED_REPORT">uPowerful Lab Tests (IMPORTED_REPORT)</option>
              <option value="SIMULATED">Simulated Sessions (SIMULATED)</option>
              <option value="STORED_UNVERIFIED">Stored Records (STORED_UNVERIFIED)</option>
            </select>
          </div>
        </div>

        {/* Sync & Upload Actions */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 cursor-pointer transition-all">
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isUploading ? 'Uploading...' : 'Import .main / .csv'}</span>
            <input
              type="file"
              accept=".main,.csv,.tsv"
              onChange={handleFileUpload}
              disabled={isUploading}
              className="hidden"
            />
          </label>

          <button
            onClick={onSyncUPowerful}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Scanning...' : 'Sync uPowerful BST'}</span>
          </button>
        </div>
      </div>

      {uploadStatus && (
        <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-slate-200 flex items-center justify-between">
          <span>{uploadStatus}</span>
          <button onClick={() => setUploadStatus(null)} className="text-slate-400 hover:text-white font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {/* Main Grid: Test List & Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Test List Table (Col 2) */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">
                Test Records Repository ({filteredTests.length})
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">Click row to inspect session</span>
          </div>

          <div className="overflow-x-auto flex-1 max-h-[600px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="py-2.5 px-3">ID</th>
                  <th className="py-2.5 px-3">Test Name / File</th>
                  <th className="py-2.5 px-3">Procedure</th>
                  <th className="py-2.5 px-3">Provenance</th>
                  <th className="py-2.5 px-3">Max V</th>
                  <th className="py-2.5 px-3">Capacity</th>
                  <th className="py-2.5 px-3">Points</th>
                  <th className="py-2.5 px-3 text-right">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      No matching test records found. Click "Sync uPowerful BST" to import lab tests.
                    </td>
                  </tr>
                ) : (
                  filteredTests.map((test) => {
                    const isSelected = selectedTest?.id === test.id;
                    return (
                      <tr
                        key={test.id}
                        onClick={() => onSelectTest(test.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-600/15 border-l-2 border-l-blue-500 text-white'
                            : 'hover:bg-slate-800/40 text-slate-300'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-400">#{test.id}</td>
                        <td className="py-2.5 px-3 font-medium max-w-[180px] truncate" title={test.test_name}>
                          {test.test_name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{test.procedure_name || 'Standard'}</td>
                        <td className="py-2.5 px-3">
                          <DataProvenanceBadge provenance={test.provenance} size="sm" />
                        </td>
                        <td className="py-2.5 px-3 font-mono text-cyan-400">
                          {test.max_voltage ? `${test.max_voltage.toFixed(2)} V` : '--'}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {test.capacity_ah !== undefined ? `${test.capacity_ah.toFixed(3)} Ah` : '--'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">{test.total_records}</td>
                        <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={getReportDownloadUrl(test.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white inline-flex transition-all"
                            title="Download PDF"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Test Detail Drawer (Col 1) */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm flex flex-col justify-between">
          {selectedTest ? (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono font-bold text-blue-400">Session #{selectedTest.id}</span>
                  <DataProvenanceBadge provenance={selectedTest.provenance} size="sm" />
                </div>
                <h3 className="text-base font-bold text-white break-words" title={selectedTest.test_name}>
                  {selectedTest.test_name}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Procedure: <span className="text-slate-200 font-medium">{selectedTest.procedure_name || 'N/A'}</span>
                  {selectedTest.channel_no && ` | Channel: ${selectedTest.channel_no}`}
                </p>
              </div>

              {/* Statistics Matrix */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-500 block text-[11px] flex items-center gap-1">
                    <Zap className="w-3 h-3 text-cyan-400" /> Voltage Range
                  </span>
                  <span className="font-mono text-white font-semibold">
                    {selectedTest.min_voltage !== undefined && selectedTest.max_voltage !== undefined
                      ? `${selectedTest.min_voltage.toFixed(2)} - ${selectedTest.max_voltage.toFixed(2)} V`
                      : 'N/A'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-500 block text-[11px] flex items-center gap-1">
                    <Gauge className="w-3 h-3 text-blue-400" /> Current Range
                  </span>
                  <span className="font-mono text-white font-semibold">
                    {selectedTest.min_current !== undefined && selectedTest.max_current !== undefined
                      ? `${selectedTest.min_current.toFixed(2)} / ${selectedTest.max_current.toFixed(2)} A`
                      : 'N/A'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-500 block text-[11px] flex items-center gap-1">
                    <Layers className="w-3 h-3 text-emerald-400" /> Total Capacity
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {selectedTest.capacity_ah !== undefined ? `${selectedTest.capacity_ah.toFixed(4)} Ah` : 'N/A'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-500 block text-[11px] flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" /> Total Energy
                  </span>
                  <span className="font-mono text-amber-400 font-bold">
                    {selectedTest.energy_wh !== undefined ? `${selectedTest.energy_wh.toFixed(4)} Wh` : 'N/A'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-500 block text-[11px] flex items-center gap-1">
                    <Thermometer className="w-3 h-3 text-orange-400" /> Peak Temp
                  </span>
                  <span className="font-mono text-white font-semibold">
                    {selectedTest.peak_temperature !== undefined ? `${selectedTest.peak_temperature.toFixed(1)} °C` : 'N/A'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-500 block text-[11px] flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" /> Duration
                  </span>
                  <span className="font-mono text-white font-semibold">
                    {selectedTest.duration_seconds !== undefined ? `${selectedTest.duration_seconds.toFixed(1)} s` : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Source file info */}
              {selectedTest.source_file && (
                <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] text-slate-400 break-all font-mono">
                  File: {selectedTest.source_file}
                </div>
              )}

              {/* Alerts or outcome badge */}
              <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/40 flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Status: {selectedTest.status || 'COMPLETED'} | Outcome: {selectedTest.test_outcome || 'PASS'}</span>
              </div>

              {/* Actions */}
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={() => onViewCharts(selectedTest.id)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all"
                >
                  <LineChart className="w-4 h-4" />
                  <span>Inspect Visual Curves & Charts</span>
                </button>

                <a
                  href={getReportDownloadUrl(selectedTest.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Formal PDF Report</span>
                </a>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <FileSpreadsheet className="w-12 h-12 stroke-[1] mb-2 text-slate-600" />
              <p className="text-sm font-medium">Select a test from the repository to view full telemetry and download reports.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
