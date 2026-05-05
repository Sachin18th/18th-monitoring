import { SyntheticStatus, SyntheticRunResult, SyntheticStep } from './types';
import crypto from 'crypto';

export class SyntheticRunner {
  static async runJourney(projectId: string, journey: any): Promise<SyntheticRunResult> {
    const runId = crypto.randomUUID();
    const startTime = Date.now();
    const stepResults: SyntheticStep[] = [];
    let overallStatus = SyntheticStatus.PASS;
    let errorMessage: string | undefined;

    console.log(`[SyntheticRunner] Starting journey: ${journey.name} (Run: ${runId})`);

    try {
      for (const step of journey.steps) {
        const stepStart = Date.now();
        try {
          // Simulate browser execution
          await this.simulateExecution(step.name);
          
          stepResults.push({
            name: step.name,
            duration: Date.now() - stepStart,
            status: SyntheticStatus.PASS
          });
        } catch (err) {
          overallStatus = SyntheticStatus.FAIL;
          errorMessage = (err as Error).message;
          stepResults.push({
            name: step.name,
            duration: Date.now() - stepStart,
            status: SyntheticStatus.FAIL,
            error: errorMessage
          });
          break; // Stop journey on first failure
        }
      }
    } catch (err) {
      overallStatus = SyntheticStatus.FAIL;
      errorMessage = (err as Error).message;
    }

    return {
      runId,
      journeyKey: journey.key,
      projectId,
      status: overallStatus,
      duration: Date.now() - startTime,
      steps: stepResults,
      timestamp: new Date().toISOString(),
      errorMessage,
      screenshotUrl: overallStatus === SyntheticStatus.FAIL ? `/screenshots/${runId}.png` : undefined
    };
  }

  private static async simulateExecution(stepName: string) {
    // Simulate real browser latency (200ms - 1500ms)
    const latency = Math.floor(Math.random() * 1300) + 200;
    await new Promise(resolve => setTimeout(resolve, latency));

    // Simulate occasional random failure (2% chance) for realism
    if (Math.random() < 0.02) {
      throw new Error(`Timeout waiting for selector: "${stepName}_cta"`);
    }
  }
}
