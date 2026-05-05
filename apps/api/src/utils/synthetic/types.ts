export enum SyntheticStatus {
  PASS = 'PASS',
  FAIL = 'FAIL',
  PENDING = 'PENDING'
}

export interface SyntheticStep {
  name: string;
  duration: number;
  status: SyntheticStatus;
  error?: string;
}

export interface SyntheticRunResult {
  runId: string;
  journeyKey: string;
  projectId: string;
  status: SyntheticStatus;
  duration: number;
  steps: SyntheticStep[];
  timestamp: string;
  screenshotUrl?: string;
  errorMessage?: string;
}

export interface SyntheticJourney {
  key: string;
  name: string;
  steps: {
    name: string;
    action: () => Promise<void>;
  }[];
}
