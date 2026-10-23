import React, { useState, useEffect, useRef } from 'react';
import { DataProvenanceBadge } from './DataProvenanceBadge';
import { startSimulator, stepSimulator, stopSimulator } from '../api';
import {
  Play,
  Square,
  FastForward,
  Cpu,
  AlertTriangle,
  Zap,
  Gauge,
  Thermometer,
  BatteryCharging,
} from 'lucide-react';

interface Props {
  onSimulationUpdated?: () => void;
}

export const SimulatorWorkbench: React.FC<Props> = ({ onSimulationUpdated }) => {
  const [mode, setMode] = useState<'CHARGE' | 'DISCHARGE'>('CHARGE');
  const [currentAmps, setCurrentAmps] = useState<number>(50.0);
  const [initialSoc, setInitialSoc] = useState<number>(50.0);
  const [capacityAh, setCapacityAh] = useState<number>(100.0);

  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [simTelemetry, setSimTelemetry] = useState<{
    voltage: number;
    current: number;
    temperature: number;
    soc: number;
  }>({
    voltage: 400.0,
    current: 0.0,
    temperature: 25.0,
    soc: 50.0,
  });

  const [history, setHistory] = useState<Array<{ time: number; voltage: number; current: number; temp: number; soc: number }>>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  const timerRef = useRef<any>(null);

  const handleStart = async () => {
    try {
      const res = await startSimulator({
        mode,
        current_amps: currentAmps,
        initial_soc: initialSoc,
        capacity_ah: capacityAh,
      });
      setIsRunning(true);
      setSessionId(res.session_id);
      if (res.step) {
        setSimTelemetry(res.step);
        setHistory([{ time: 0, voltage: res.step.voltage, current: res.step.current, temp: res.step.temperature, soc: res.step.soc }]);
      }
      onSimulationUpdated?.();
    } catch (err: any) {
      alert(`Simulator error: ${err.message}`);
    }
  };

  const handleStep = async () => {
    try {
      const res = await stepSimulator();
      if (res.step) {
        setSimTelemetry(res.step);
        setHistory((prev) => [
          ...prev.slice(-30),
          {
            time: prev.length,
            voltage: res.step.voltage,
            current: res.step.current,
            temp: res.step.temperature,
            soc: res.step.soc,
          },
        ]);

        // Excursion checks
        const newAlerts: string[] = [];
        if (res.step.temperature > 45.0) newAlerts.push(`High Temperature limit reached: ${res.step.temperature.toFixed(1)} °C`);
        if (res.step.voltage > 430.0) newAlerts.push(`Over-voltage threshold exceeded: ${res.step.voltage.toFixed(1)} V`);
        if (res.step.voltage < 310.0) newAlerts.push(`Low-voltage threshold reached: ${res.step.voltage.toFixed(1)} V`);
        setAlerts(newAlerts);
      }
      onSimulationUpdated?.();
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleStop = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      await stopSimulator();
      setIsRunning(false);
      onSimulationUpdated?.();
    } catch (err: any) {
      console.error(err);
    }
  };

  // Continuous loop runner when active
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        handleStep();
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  return (
    <div className="space-y-6">
      {/* Simulation Safety & Provenance Header */}
      <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4 flex items-start gap-3.5 shadow-sm">
        <Cpu className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <div className="flex-1 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-purple-300 text-sm">Battery Test Simulation Workbench</span>
            <DataProvenanceBadge provenance="SIMULATED" size="sm" />
          </div>
          <p className="text-slate-300 leading-relaxed">
            All data generated here originates from the synthetic electrochemical simulation engine. Physical hardware is
            disconnected. Safe test boundary limits (45 °C, 430 V, 310 V) are checked on every step.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Simulator Controls Card */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>Simulation Test Controls</span>
            </h3>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Test Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('CHARGE')}
                    disabled={isRunning}
                    className={`py-2 px-3 rounded-lg font-semibold text-xs transition-all ${
                      mode === 'CHARGE'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    Constant Current Charge
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('DISCHARGE')}
                    disabled={isRunning}
                    className={`py-2 px-3 rounded-lg font-semibold text-xs transition-all ${
                      mode === 'DISCHARGE'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    Constant Current Discharge
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Current Setting</span>
                  <span className="font-mono text-white font-bold">{currentAmps} A</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={150}
                  step={5}
                  value={currentAmps}
                  disabled={isRunning}
                  onChange={(e) => setCurrentAmps(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Initial Pack SOC</span>
                  <span className="font-mono text-white font-bold">{initialSoc} %</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={initialSoc}
                  disabled={isRunning}
                  onChange={(e) => setInitialSoc(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Rated Capacity</span>
                  <span className="font-mono text-white font-bold">{capacityAh} Ah</span>
                </div>
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={capacityAh}
                  disabled={isRunning}
                  onChange={(e) => setCapacityAh(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* Start / Step / Stop Buttons */}
          <div className="mt-6 pt-4 border-t border-slate-800 space-y-2">
            {!isRunning ? (
              <button
                onClick={handleStart}
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Start Simulation Run</span>
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleStop}
                  className="w-full py-2.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>Stop & Save Session</span>
                </button>
                <button
                  onClick={handleStep}
                  className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
                >
                  <FastForward className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Manual Step Forward</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Live Simulation Telemetry Display (Col 2) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80">
              <span className="text-[11px] text-slate-400 block mb-1 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-cyan-400" /> Voltage
              </span>
              <span className="text-2xl font-bold font-mono text-white">
                {simTelemetry.voltage.toFixed(2)} V
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80">
              <span className="text-[11px] text-slate-400 block mb-1 flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-blue-400" /> Current
              </span>
              <span className={`text-2xl font-bold font-mono ${simTelemetry.current < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {simTelemetry.current.toFixed(2)} A
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80">
              <span className="text-[11px] text-slate-400 block mb-1 flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-orange-400" /> Temperature
              </span>
              <span className={`text-2xl font-bold font-mono ${simTelemetry.temperature > 45 ? 'text-rose-400' : 'text-white'}`}>
                {simTelemetry.temperature.toFixed(1)} °C
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80">
              <span className="text-[11px] text-slate-400 block mb-1 flex items-center gap-1">
                <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" /> State of Charge
              </span>
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {simTelemetry.soc.toFixed(1)} %
              </span>
            </div>
          </div>

          {/* Alerts panel */}
          {alerts.length > 0 && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Configurable Test Boundary Excursions Detected:</span>
              </div>
              {alerts.map((a, i) => (
                <p key={i} className="text-xs text-amber-200 pl-5">
                  • {a}
                </p>
              ))}
            </div>
          )}

          {/* Stepping History Log */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-xs font-semibold text-slate-300">Real-Time Step Telemetry Stream</h4>
              <span className="text-[11px] font-mono text-slate-500">
                {isRunning ? '● RUNNING' : '○ IDLE'} {sessionId ? `(Session #${sessionId})` : ''}
              </span>
            </div>

            <div className="overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-[11px]">
                    <th className="py-1.5 px-2">Step</th>
                    <th className="py-1.5 px-2">Voltage</th>
                    <th className="py-1.5 px-2">Current</th>
                    <th className="py-1.5 px-2">Temp</th>
                    <th className="py-1.5 px-2">SOC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {history.slice().reverse().map((h, i) => (
                    <tr key={i} className="text-slate-300">
                      <td className="py-1.5 px-2 text-slate-500">#{h.time}</td>
                      <td className="py-1.5 px-2 text-cyan-400">{h.voltage.toFixed(2)} V</td>
                      <td className="py-1.5 px-2">{h.current.toFixed(2)} A</td>
                      <td className={`py-1.5 px-2 ${h.temp > 45 ? 'text-rose-400 font-bold' : ''}`}>
                        {h.temp.toFixed(1)} °C
                      </td>
                      <td className="py-1.5 px-2 text-emerald-400">{h.soc.toFixed(1)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
