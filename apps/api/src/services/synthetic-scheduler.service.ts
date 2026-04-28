import { SyntheticRunner } from '../utils/synthetic/runner';
import { PREDEFINED_JOURNEYS } from '../utils/synthetic/journeys';
import { IngestionService } from './ingestion.service';

export class SyntheticSchedulerService {
  private static interval: NodeJS.Timeout | null = null;
  private static RUN_INTERVAL = 10 * 60 * 1000; // Every 10 minutes

  static start() {
    if (this.interval) return;

    console.log('[SyntheticScheduler] Starting Proactive Monitoring Engine…');
    
    // Initial run
    this.executeAll();

    this.interval = setInterval(() => {
      this.executeAll();
    }, this.RUN_INTERVAL);
  }

  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private static async executeAll() {
    const activeProjects = ['proj-18th-digitech']; // Targeted canonical project
    
    console.log(`[SyntheticScheduler] Executing synthetic checks for ${activeProjects.length} projects...`);

    for (const projectId of activeProjects) {
      for (const journey of PREDEFINED_JOURNEYS) {
        try {
          const result = await SyntheticRunner.runJourney(projectId, journey);
          
          if (!result || !result.runId) {
            console.warn(`[SyntheticScheduler] Received invalid result for ${projectId} / ${journey.name}`);
            continue;
          }

          // Ingest result as a synthetic_run event
          const event = {
            eventId: result.runId,
            eventType: 'synthetic_run',
            siteId: projectId,
            timestamp: result.timestamp || new Date().toISOString(),
            metadata: {
              journeyKey: result.journeyKey,
              journeyName: journey.name,
              status: result.status,
              duration: result.duration || 0,
              steps: result.steps || [],
              errorMessage: result.errorMessage,
              screenshotUrl: result.screenshotUrl
            }
          };

          await IngestionService.processServerEvents(projectId, [event]);
          
          console.log(`[SyntheticScheduler] Run ${result.runId} completed for ${projectId}: ${result.status}`);
        } catch (err) {
          console.error(`[SyntheticScheduler] Critical failure during journey execution for ${projectId} / ${journey.name}:`, err);
        }
      }
    }
  }
}
