import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { execFileSync, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const MAX_CONCURRENT_JOBS = 3;
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour

interface ScraperJob {
  status: 'running' | 'completed' | 'failed';
  scraper: string;
  url: string;
  venueName: string;
  startedAt: Date;
  completedAt?: Date;
  events: any[];
  metrics?: any;
  error?: string;
  logs: string[];
}

// Store for active scraper jobs
const activeJobs = new Map<string, ScraperJob>();

// Generate a simple job ID
function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Clean up old jobs (TTL-based)
function cleanupOldJobs(): void {
  const now = Date.now();
  for (const [jobId, job] of activeJobs) {
    if (job.completedAt && now - job.completedAt.getTime() > JOB_TTL_MS) {
      activeJobs.delete(jobId);
    } else if (!job.completedAt && now - job.startedAt.getTime() > JOB_TTL_MS) {
      activeJobs.delete(jobId);
    }
  }
}

// Count currently running jobs
function getRunningJobCount(): number {
  let count = 0;
  for (const job of activeJobs.values()) {
    if (job.status === 'running') count++;
  }
  return count;
}

// Check if agent-browser is installed
function isAgentBrowserInstalled(): boolean {
  try {
    execFileSync('agent-browser', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Get project root directory (find nearest pnpm-workspace.yaml)
function getProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd(); // Fallback
}

// Schema for scraper types
const scraperTypeSchema = z.enum(['agent-browser', 'playwright', 'universal']);

export const scrapersRouter = router({
  /**
   * Get available scraper types and their status
   */
  getScraperTypes: publicProcedure.query(async () => {
    const agentBrowserInstalled = isAgentBrowserInstalled();

    return {
      scrapers: [
        {
          id: 'agent-browser',
          name: 'Agent Browser',
          description:
            'Uses Vercel agent-browser for accessibility tree extraction. 93% less tokens than HTML.',
          available: agentBrowserInstalled,
          unavailableReason: agentBrowserInstalled
            ? undefined
            : 'agent-browser not installed. Run: npm install -g agent-browser && agent-browser install',
        },
        {
          id: 'playwright',
          name: 'Playwright + Claude',
          description:
            'Uses Playwright to render JavaScript, then sends full HTML to Claude for extraction.',
          available: true,
        },
        {
          id: 'universal',
          name: 'Universal (Fetch)',
          description:
            'Simple HTTP fetch + Claude extraction. Best for static HTML pages.',
          available: true,
        },
      ],
    };
  }),

  /**
   * Start a scraper job
   */
  startScraper: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
        venueName: z.string().min(1),
        scraperType: scraperTypeSchema,
      })
    )
    .mutation(async ({ input }) => {
      const { url, venueName, scraperType } = input;

      // Clean up old jobs and check concurrency
      cleanupOldJobs();
      if (getRunningJobCount() >= MAX_CONCURRENT_JOBS) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Max ${MAX_CONCURRENT_JOBS} concurrent scraper jobs. Wait for a job to finish.`,
        });
      }

      // Check if agent-browser is available if selected
      if (scraperType === 'agent-browser' && !isAgentBrowserInstalled()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'agent-browser is not installed. Run: npm install -g agent-browser && agent-browser install',
        });
      }

      const jobId = generateJobId();

      // Initialize job
      activeJobs.set(jobId, {
        status: 'running',
        scraper: scraperType,
        url,
        venueName,
        startedAt: new Date(),
        events: [],
        logs: [`Starting ${scraperType} scraper for ${url}`],
      });

      // Run scraper in background
      runScraperAsync(jobId, url, venueName, scraperType);

      return { jobId };
    }),

  /**
   * Get job status and results
   */
  getJobStatus: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = activeJobs.get(input.jobId);

      if (!job) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Job not found',
        });
      }

      return {
        jobId: input.jobId,
        status: job.status,
        scraper: job.scraper,
        url: job.url,
        venueName: job.venueName,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        events: job.events,
        metrics: job.metrics,
        error: job.error,
        logs: job.logs,
        eventCount: job.events.length,
        durationMs: job.completedAt
          ? job.completedAt.getTime() - job.startedAt.getTime()
          : Date.now() - job.startedAt.getTime(),
      };
    }),

  /**
   * List recent jobs
   */
  listJobs: publicProcedure.query(async () => {
    const jobs = Array.from(activeJobs.entries())
      .map(([jobId, job]) => ({
        jobId,
        status: job.status,
        scraper: job.scraper,
        url: job.url,
        venueName: job.venueName,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        eventCount: job.events.length,
        error: job.error,
      }))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 20);

    return { jobs };
  }),

  /**
   * Run comparison of all scrapers on same URL
   */
  compareScrapers: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
        venueName: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const { url, venueName } = input;

      // Clean up and check concurrency
      cleanupOldJobs();
      if (getRunningJobCount() >= MAX_CONCURRENT_JOBS) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Max ${MAX_CONCURRENT_JOBS} concurrent scraper jobs. Wait for current jobs to finish.`,
        });
      }

      const comparisonId = generateJobId();

      // Create jobs for each available scraper
      const scraperTypes: Array<'agent-browser' | 'playwright' | 'universal'> = [
        'universal',
        'playwright',
      ];

      if (isAgentBrowserInstalled()) {
        scraperTypes.unshift('agent-browser');
      }

      const jobIds: Record<string, string> = {};

      for (const scraperType of scraperTypes) {
        const jobId = generateJobId();
        jobIds[scraperType] = jobId;

        activeJobs.set(jobId, {
          status: 'running',
          scraper: scraperType,
          url,
          venueName,
          startedAt: new Date(),
          events: [],
          logs: [`Starting ${scraperType} scraper for comparison`],
        });

        // Run scrapers (they run async, not blocking each other)
        runScraperAsync(jobId, url, venueName, scraperType);
      }

      return { comparisonId, jobIds };
    }),

  /**
   * Trigger all scrapers to run now via BullMQ queue
   * The agents worker picks up the jobs
   */
  triggerAll: publicProcedure.mutation(async () => {
    const { env } = await import('../../../config/env');
    const redisConn = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    const queue = new Queue('scrapers', { connection: redisConn });

    try {
      // Add a "run-all" job that the orchestrator worker will pick up
      const job = await queue.add('run-all', { triggeredAt: new Date().toISOString() }, {
        removeOnComplete: true,
        removeOnFail: { age: 86400 },
      });

      // Also get queue stats
      const counts = await queue.getJobCounts();

      await redisConn.quit();

      return {
        success: true,
        jobId: job.id,
        queueStats: counts,
        message: 'Scraper run triggered. Check agents logs for progress.',
      };
    } catch (error: any) {
      await redisConn.quit();
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to trigger scrapers: ${error.message}`,
      });
    }
  }),
});

/**
 * Run scraper as a subprocess using the playground-runner script
 */
async function runScraperAsync(
  jobId: string,
  url: string,
  venueName: string,
  scraperType: 'agent-browser' | 'playwright' | 'universal'
) {
  const job = activeJobs.get(jobId);
  if (!job) return;

  try {
    const projectRoot = getProjectRoot();

    job.logs.push(`Running scraper subprocess...`);

    // Create a temporary output file for results
    const outputFile = path.join('/tmp', `scraper-${jobId}.json`);

    // Run the scraper script as a subprocess
    const child = spawn(
      'pnpm',
      [
        '--filter',
        '@slo-events/agents',
        'exec',
        'tsx',
        'src/scripts/playground-runner.ts',
        '--url',
        url,
        '--venue',
        venueName,
        '--scraper',
        scraperType,
        '--output',
        outputFile,
      ],
      {
        cwd: projectRoot,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        stdout += line + '\n';
        job.logs.push(line);
      }
    });

    child.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        stderr += line + '\n';
        // Only log non-debug stderr
        if (!line.includes('ExperimentalWarning') && !line.includes('debugger')) {
          job.logs.push(`[stderr] ${line}`);
        }
      }
    });

    child.on('close', (code) => {
      job.completedAt = new Date();

      if (code === 0) {
        // Read results from output file
        try {
          if (fs.existsSync(outputFile)) {
            const results = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
            job.events = results.events || [];
            job.metrics = results.metrics || {};
            job.status = 'completed';
            job.logs.push(`Completed! Found ${job.events.length} events.`);

            // Clean up temp file
            fs.unlinkSync(outputFile);
          } else {
            job.status = 'failed';
            job.error = 'Output file not found';
            job.logs.push(`Error: Output file not found`);
          }
        } catch (parseError: any) {
          job.status = 'failed';
          job.error = `Failed to parse results: ${parseError.message}`;
          job.logs.push(`Error: ${parseError.message}`);
        }
      } else {
        job.status = 'failed';
        job.error = stderr || `Process exited with code ${code}`;
        job.logs.push(`Error: Process exited with code ${code}`);
      }
    });

    child.on('error', (error) => {
      job.status = 'failed';
      job.completedAt = new Date();
      job.error = error.message;
      job.logs.push(`Error: ${error.message}`);
    });
  } catch (error: any) {
    job.status = 'failed';
    job.completedAt = new Date();
    job.error = error.message;
    job.logs.push(`Error: ${error.message}`);
  }
}
