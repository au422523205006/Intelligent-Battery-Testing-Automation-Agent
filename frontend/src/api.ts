import type {
  BatteryTelemetry,
  PackSpec,
  TestSession,
  MeasurementRecord,
  UPowerfulStatus,
  ProvidersResponse,
} from './types';

const API_BASE = '/api';

export async function fetchHealth(): Promise<any> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Failed to fetch health status');
  return res.json();
}

export async function fetchBatteryStatus(): Promise<{
  hardware_status: string;
  hardware_message: string;
  active_mode: string;
  pack_spec: PackSpec;
  telemetry: BatteryTelemetry;
}> {
  const res = await fetch(`${API_BASE}/battery/status`);
  if (!res.ok) throw new Error('Failed to fetch battery status');
  return res.json();
}

export async function fetchTests(search?: string, provenance?: string): Promise<{ total: number; tests: TestSession[] }> {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (provenance) params.append('provenance', provenance);
  const url = `${API_BASE}/tests${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch tests');
  return res.json();
}

export async function fetchTestDetail(id: number): Promise<TestSession> {
  const res = await fetch(`${API_BASE}/tests/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch test #${id}`);
  return res.json();
}

export async function fetchTestMeasurements(id: number, maxPoints = 500): Promise<{
  session_id: number;
  test_name: string;
  provenance: string;
  records: MeasurementRecord[];
}> {
  const res = await fetch(`${API_BASE}/tests/${id}/measurements?max_points=${maxPoints}`);
  if (!res.ok) throw new Error(`Failed to fetch measurements for test #${id}`);
  return res.json();
}

export function getReportDownloadUrl(testId: number): string {
  return `${API_BASE}/tests/${testId}/report`;
}

export async function sendChatMessage(
  message: string,
  history?: Array<{ role?: string; content: string }>
): Promise<{
  reply: string;
  active_provider: string;
  active_model: string;
  fallback_occurred: boolean;
  fallback_reason?: string;
  attempted_providers: string[];
  diagnostics: Record<string, any>;
  tool_calls_executed: string[];
}> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      conversation_history: history,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Chat API error' }));
    throw new Error(err.detail || 'Chat request failed');
  }
  return res.json();
}

export async function fetchUPowerfulStatus(): Promise<UPowerfulStatus> {
  const res = await fetch(`${API_BASE}/upowerful/status`);
  if (!res.ok) throw new Error('Failed to fetch uPowerful status');
  return res.json();
}

export async function triggerUPowerfulSync(maxFiles = 25): Promise<{
  status: string;
  total_detected: number;
  newly_imported: number;
  already_synced: number;
  last_sync_time: string;
  errors: string[];
}> {
  const res = await fetch(`${API_BASE}/upowerful/sync?max_files=${maxFiles}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Sync operation failed');
  return res.json();
}

export async function uploadUPowerfulFile(file: File): Promise<{
  status: string;
  message: string;
  session_id: number;
  detail: TestSession;
}> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/upowerful/import`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(err.detail || 'Upload failed');
  }
  return res.json();
}

export async function fetchProviders(): Promise<ProvidersResponse> {
  const res = await fetch(`${API_BASE}/providers`);
  if (!res.ok) throw new Error('Failed to fetch LLM providers');
  return res.json();
}

export async function startSimulator(params: {
  mode: 'CHARGE' | 'DISCHARGE';
  current_amps: number;
  initial_soc: number;
  capacity_ah: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/simulator/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to start simulator');
  return res.json();
}

export async function stepSimulator(): Promise<any> {
  const res = await fetch(`${API_BASE}/simulator/step`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to step simulator');
  return res.json();
}

export async function stopSimulator(): Promise<any> {
  const res = await fetch(`${API_BASE}/simulator/stop`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to stop simulator');
  return res.json();
}
