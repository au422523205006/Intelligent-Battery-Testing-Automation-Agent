export type DataProvenance = 
  | 'SIMULATED' 
  | 'STORED_UNVERIFIED' 
  | 'IMPORTED_REPORT' 
  | 'LIVE_HARDWARE' 
  | 'UNAVAILABLE';

export interface BatteryTelemetry {
  voltage: number;
  current: number;
  temperature: number;
  soc: number;
  is_simulated?: boolean;
  provenance: DataProvenance;
  timestamp?: string | null;
}

export interface PackSpec {
  name: string;
  nominal_voltage: number;
  capacity_ah: number;
  chemistry: string;
}

export interface TestSession {
  id: number;
  battery_id: number;
  start_time: string;
  end_time?: string;
  status: string;
  test_name: string;
  procedure_name?: string;
  channel_no?: number;
  batch_no?: string;
  source_file?: string;
  provenance: DataProvenance;
  total_records: number;
  max_voltage?: number;
  min_voltage?: number;
  max_current?: number;
  min_current?: number;
  capacity_ah?: number;
  energy_wh?: number;
  peak_temperature?: number;
  duration_seconds?: number;
  test_outcome?: string;
  actual_measurement_count?: number;
  alerts?: AlertItem[];
}

export interface MeasurementRecord {
  id?: number;
  session_id: number;
  timestamp: string;
  voltage: number;
  current: number;
  temperature: number;
  soc?: number;
  step_no?: number;
  cycle_no?: number;
  process_type?: string;
  relative_time_sec?: number;
  capacity?: number;
  energy?: number;
  provenance?: DataProvenance;
}

export interface AlertItem {
  id: number;
  session_id: number;
  timestamp: string;
  message: string;
  severity: 'WARNING' | 'CRITICAL' | 'INFO';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  timestamp: string;
  active_provider?: string;
  active_model?: string;
  fallback_occurred?: boolean;
  fallback_reason?: string;
  diagnostics?: Record<string, any>;
}

export interface UPowerfulStatus {
  installed: boolean;
  install_dir: string;
  data_dir: string;
  data_dir_exists: boolean;
  dlls_present: boolean;
  bridge_script: string;
  bridge_available: boolean;
  detected_files_count: number;
  synced_tests_count: number;
  last_sync_time?: string | null;
  sample_files?: string[];
}

export interface ProviderItem {
  provider: string;
  id: string;
  configured: boolean;
  model: string;
  is_primary: boolean;
}

export interface ProvidersResponse {
  fallback_order: string[];
  primary_provider: string;
  providers: ProviderItem[];
  rule_based_fallback_active: boolean;
}
