import React, { useState, useEffect } from 'react';
import type { TestSession, MeasurementRecord } from '../types';
import { DataProvenanceBadge } from './DataProvenanceBadge';
import { fetchTestMeasurements, getReportDownloadUrl } from '../api';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import {
  Zap,
  Gauge,
  Thermometer,
  Layers,
  Download,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';

interface Props {
  tests: TestSession[];
  activeTestId: number | null;
  onSelectTest: (testId: number) => void;
}

export const TestCharts: React.FC<Props> = ({ tests, activeTestId, onSelectTest }) => {
  const [currentId, setCurrentId] = useState<number | null>(activeTestId || (tests[0]?.id ?? null));
  const [measurements, setMeasurements] = useState<MeasurementRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTestId && activeTestId !== currentId) {
      setCurrentId(activeTestId);
    }
  }, [activeTestId]);

  useEffect(() => {
    if (!currentId) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchTestMeasurements(currentId, 500)
      .then((data) => {
        if (isMounted) {
          setMeasurements(data.records || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load telemetry data');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentId]);

  const activeTest = tests.find((t) => t.id === currentId) || null;

  // Chart data formatting
  const chartData = measurements.map((m, idx) => ({
    time: m.relative_time_sec !== undefined ? m.relative_time_sec : idx,
    voltage: m.voltage,
    current: m.current,
    temperature: m.temperature,
    capacity: m.capacity !== undefined ? m.capacity : 0,
    energy: m.energy !== undefined ? m.energy : 0,
    step: m.step_no,
    process: m.process_type || 'TEST',
  }));

  return (
    <div className="space-y-6">
      {/* Test Selector and Summary Header */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-950/60 border border-blue-500/30 text-blue-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <label htmlFor="test-select" className="text-xs text-slate-400 font-medium">
                Active Test Record:
              </label>
              {activeTest && <DataProvenanceBadge provenance={activeTest.provenance} size="sm" />}
            </div>
            <select
              id="test-select"
              value={currentId || ''}
              onChange={(e) => {
                const id = Number(e.target.value);
                setCurrentId(id);
                onSelectTest(id);
              }}
              className="mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-cyan-500 max-w-[320px] truncate"
            >
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.id}: {t.test_name} ({t.provenance})
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeTest && (
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <div className="text-right hidden sm:block text-xs">
              <span className="text-slate-400 block text-[11px]">Datapoints</span>
              <span className="font-mono text-white font-bold">{measurements.length}</span>
            </div>
            <a
              href={getReportDownloadUrl(activeTest.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Download PDF Report</span>
            </a>
          </div>
        )}
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-12 text-center text-slate-400">
          <div className="inline-block animate-spin w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full mb-3" />
          <p className="text-xs">Loading high-resolution test telemetry points...</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && measurements.length === 0 && (
        <div className="p-12 text-center text-slate-500 rounded-xl border border-slate-800 bg-slate-900/40">
          No telemetry points recorded for this session.
        </div>
      )}

      {!loading && measurements.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Voltage Profile */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Voltage Curve (V) vs Time (s)
                </h3>
              </div>
              <span className="text-[11px] font-mono text-cyan-400">
                Peak: {Math.max(...measurements.map((m) => m.voltage)).toFixed(3)} V
              </span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} unit="s" />
                  <YAxis stroke="#64748b" fontSize={10} domain={['auto', 'auto']} unit="V" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                    labelFormatter={(val) => `Time: ${val}s`}
                  />
                  <Line type="monotone" dataKey="voltage" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Current Profile */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Current Curve (A) vs Time (s)
                </h3>
              </div>
              <span className="text-[11px] font-mono text-blue-400">
                Rate: {measurements[0]?.current?.toFixed(2) || 0} A
              </span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} unit="s" />
                  <YAxis stroke="#64748b" fontSize={10} domain={['auto', 'auto']} unit="A" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                    labelFormatter={(val) => `Time: ${val}s`}
                  />
                  <Line type="stepAfter" dataKey="current" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Temperature Profile */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-orange-400" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Temperature (°C) vs Time (s)
                </h3>
              </div>
              <span className="text-[11px] font-mono text-orange-400">
                Max: {Math.max(...measurements.map((m) => m.temperature)).toFixed(1)} °C
              </span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} unit="s" />
                  <YAxis stroke="#64748b" fontSize={10} domain={['auto', 'auto']} unit="°C" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                    labelFormatter={(val) => `Time: ${val}s`}
                  />
                  <Area type="monotone" dataKey="temperature" stroke="#f97316" fillOpacity={1} fill="url(#tempGradient)" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 4: Capacity & Energy Curve */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Delivered Capacity (Ah) & Energy (Wh)
                </h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-400">
                Total: {Math.max(...measurements.map((m) => m.capacity || 0)).toFixed(4)} Ah
              </span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} unit="s" />
                  <YAxis stroke="#64748b" fontSize={10} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                    labelFormatter={(val) => `Time: ${val}s`}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                  <Line type="monotone" dataKey="capacity" name="Capacity (Ah)" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="energy" name="Energy (Wh)" stroke="#eab308" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
