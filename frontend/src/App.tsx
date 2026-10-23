import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import type { NavTab } from './components/Sidebar';
import { Header } from './components/Header';
import { Overview } from './components/Overview';
import { TestDashboard } from './components/TestDashboard';
import { TestCharts } from './components/TestCharts';
import { SimulatorWorkbench } from './components/SimulatorWorkbench';
import { Chatbot } from './components/Chatbot';
import { SystemHealth } from './components/SystemHealth';
import type {
  BatteryTelemetry,
  PackSpec,
  TestSession,
  UPowerfulStatus,
} from './types';
import {
  fetchBatteryStatus,
  fetchTests,
  fetchTestDetail,
  fetchUPowerfulStatus,
  triggerUPowerfulSync,
} from './api';

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');

  const [telemetry, setTelemetry] = useState<BatteryTelemetry>({
    voltage: 400.0,
    current: 0.0,
    temperature: 25.0,
    soc: 50.0,
    provenance: 'SIMULATED',
  });

  const [packSpec, setPackSpec] = useState<PackSpec>({
    name: 'Default EV Pack',
    nominal_voltage: 400.0,
    capacity_ah: 100.0,
    chemistry: 'Li-Ion',
  });

  const [hardwareStatus, setHardwareStatus] = useState('DISCONNECTED');
  const [tests, setTests] = useState<TestSession[]>([]);
  const [selectedTest, setSelectedTest] = useState<TestSession | null>(null);
  const [upowerfulStatus, setUPowerfulStatus] = useState<UPowerfulStatus | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load telemetry & pack data
  const loadBatteryStatus = useCallback(async () => {
    try {
      const data = await fetchBatteryStatus();
      if (data.telemetry) setTelemetry(data.telemetry);
      if (data.pack_spec) setPackSpec(data.pack_spec);
      if (data.hardware_status) setHardwareStatus(data.hardware_status);
    } catch (err) {
      console.error('Error fetching battery status:', err);
    }
  }, []);

  // Load test sessions list
  const loadTests = useCallback(async () => {
    try {
      const data = await fetchTests(undefined, undefined);
      setTests(data.tests || []);
      if (data.tests && data.tests.length > 0 && !selectedTest) {
        setSelectedTest(data.tests[0]);
      }
    } catch (err) {
      console.error('Error fetching tests:', err);
    }
  }, [selectedTest]);

  // Load uPowerful status
  const loadUPowerful = useCallback(async () => {
    try {
      const data = await fetchUPowerfulStatus();
      setUPowerfulStatus(data);
    } catch (err) {
      console.error('Error fetching uPowerful status:', err);
    }
  }, []);

  // Refresh all
  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([loadBatteryStatus(), loadTests(), loadUPowerful()]);
    setIsRefreshing(false);
  }, [loadBatteryStatus, loadTests, loadUPowerful]);

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Periodic polling for telemetry (every 4 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      loadBatteryStatus();
    }, 4000);
    return () => clearInterval(interval);
  }, [loadBatteryStatus]);

  // Handle uPowerful sync
  const handleSyncUPowerful = async () => {
    setIsSyncing(true);
    try {
      await triggerUPowerfulSync(25);
      await loadTests();
      await loadUPowerful();
    } catch (err: any) {
      alert(`uPowerful sync error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle test selection
  const handleSelectTest = async (testId: number) => {
    try {
      const detail = await fetchTestDetail(testId);
      setSelectedTest(detail);
    } catch (err) {
      console.error(err);
    }
  };

  const handleViewCharts = (testId: number) => {
    handleSelectTest(testId);
    setActiveTab('charts');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header
          activeTab={activeTab}
          onRefresh={refreshAll}
          isRefreshing={isRefreshing}
          primaryLLM="GROQ"
          hardwareStatus={hardwareStatus}
        />

        {/* Scrollable View Container */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'overview' && (
              <Overview
                telemetry={telemetry}
                packSpec={packSpec}
                latestTests={tests}
                upowerfulStatus={upowerfulStatus}
                onSyncUPowerful={handleSyncUPowerful}
                isSyncing={isSyncing}
                onSelectTest={handleSelectTest}
                onNavigateToTab={setActiveTab}
              />
            )}

            {activeTab === 'tests' && (
              <TestDashboard
                tests={tests}
                selectedTest={selectedTest}
                onSelectTest={handleSelectTest}
                onSyncUPowerful={handleSyncUPowerful}
                isSyncing={isSyncing}
                onViewCharts={handleViewCharts}
                onRefreshTests={loadTests}
              />
            )}

            {activeTab === 'charts' && (
              <TestCharts
                tests={tests}
                activeTestId={selectedTest ? selectedTest.id : (tests[0]?.id ?? null)}
                onSelectTest={handleSelectTest}
              />
            )}

            {activeTab === 'simulator' && (
              <SimulatorWorkbench onSimulationUpdated={loadBatteryStatus} />
            )}

            {activeTab === 'chat' && (
              <Chatbot onRefreshData={refreshAll} />
            )}

            {activeTab === 'health' && (
              <SystemHealth />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
