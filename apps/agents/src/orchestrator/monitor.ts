import { prisma } from '@slo-events/database';
import { ScraperStatus } from '../types';
import { logger } from '../lib/scraper-utils';
import { getQueueStats, getScheduledJobs } from './queue';
import { getAllScrapers } from './scheduler';

/**
 * Monitor scraper health and performance
 */
export class ScraperMonitor {
  private alertThreshold = 3; // Alert after N consecutive failures

  /**
   * Get health status for all scrapers
   */
  async getHealthStatus() {
    const scrapers = getAllScrapers();
    const healthStatus = [];

    for (const { name, scraper } of scrapers) {
      try {
        const stats = await this.getScraperHealth(name);
        healthStatus.push({
          name,
          schedule: scraper.schedule,
          ...stats,
        });
      } catch (error: any) {
        logger.error(`Failed to get health for ${name}: ${error.message}`);
      }
    }

    return healthStatus;
  }

  /**
   * Get health statistics for a specific scraper
   */
  async getScraperHealth(scraperName: string) {
    // Get recent runs (last 7 days)
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const runs = await prisma.scraperRun.findMany({
      where: {
        sourceName: scraperName,
        startedAt: { gte: since },
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    // Get last run
    const lastRun = runs[0];

    // Calculate success rate
    const totalRuns = runs.length;
    const successfulRuns = runs.filter(
      (r) => r.status === ScraperStatus.SUCCESS || r.status === ScraperStatus.PARTIAL
    ).length;
    const successRate = totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0;

    // Check consecutive failures
    let consecutiveFailures = 0;
    for (const run of runs) {
      if (run.status === ScraperStatus.FAILED) {
        consecutiveFailures++;
      } else {
        break;
      }
    }

    // Calculate average events per run
    const totalEvents = runs.reduce((sum, r) => sum + r.eventsNew, 0);
    const avgEventsPerRun = totalRuns > 0 ? totalEvents / totalRuns : 0;

    // Determine health status
    const isHealthy =
      successRate >= 50 && consecutiveFailures < this.alertThreshold;

    // Check if alert is needed
    const needsAlert = consecutiveFailures >= this.alertThreshold;

    return {
      isHealthy,
      needsAlert,
      successRate: Math.round(successRate),
      totalRuns,
      successfulRuns,
      consecutiveFailures,
      avgEventsPerRun: Math.round(avgEventsPerRun),
      lastRun: lastRun
        ? {
            status: lastRun.status,
            startedAt: lastRun.startedAt,
            eventsFound: lastRun.eventsFound,
            eventsNew: lastRun.eventsNew,
            errorMessage: lastRun.errorMessage,
          }
        : null,
    };
  }

  /**
   * Check all scrapers and send alerts if needed
   */
  async checkAndAlert() {
    logger.info('Checking scraper health...');

    const scrapers = getAllScrapers();
    const alerts = [];

    for (const { name } of scrapers) {
      try {
        const health = await this.getScraperHealth(name);

        if (health.needsAlert) {
          const alert = {
            scraper: name,
            message: `${name} has ${health.consecutiveFailures} consecutive failures`,
            severity: 'high',
            consecutiveFailures: health.consecutiveFailures,
            lastError: health.lastRun?.errorMessage,
          };

          alerts.push(alert);
          logger.warn(`ALERT: ${alert.message}`);
        } else if (health.successRate < 50 && health.totalRuns > 5) {
          const alert = {
            scraper: name,
            message: `${name} has low success rate: ${health.successRate}%`,
            severity: 'medium',
            successRate: health.successRate,
          };

          alerts.push(alert);
          logger.warn(`WARNING: ${alert.message}`);
        }
      } catch (error: any) {
        logger.error(`Failed to check health for ${name}: ${error.message}`);
      }
    }

    return alerts;
  }

  /**
   * Get queue statistics
   */
  async getQueueStatistics() {
    const stats = await getQueueStats();
    const scheduled = await getScheduledJobs();

    return {
      queue: stats,
      scheduledJobs: scheduled.length,
      scheduled: scheduled.map((job) => ({
        id: job.id,
        name: job.name,
        pattern: job.pattern,
        next: job.next,
      })),
    };
  }

  /**
   * Get overall system health
   */
  async getSystemHealth() {
    const healthStatus = await this.getHealthStatus();
    const queueStats = await this.getQueueStatistics();

    const totalScrapers = healthStatus.length;
    const healthyScrapers = healthStatus.filter((s) => s.isHealthy).length;
    const unhealthyScrapers = totalScrapers - healthyScrapers;

    const overallHealth = unhealthyScrapers === 0 ? 'healthy' : unhealthyScrapers <= 2 ? 'warning' : 'critical';

    return {
      status: overallHealth,
      scrapers: {
        total: totalScrapers,
        healthy: healthyScrapers,
        unhealthy: unhealthyScrapers,
      },
      queue: queueStats.queue,
      scheduledJobs: queueStats.scheduledJobs,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get detailed scraper report
   */
  async getScraperReport(scraperName: string, days: number = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const runs = await prisma.scraperRun.findMany({
      where: {
        sourceName: scraperName,
        startedAt: { gte: since },
      },
      orderBy: { startedAt: 'desc' },
    });

    const totalEvents = runs.reduce((sum, r) => sum + r.eventsNew, 0);
    const totalErrors = runs.reduce((sum, r) => {
      const metadata = r.metadata as any;
      return sum + (metadata?.errors || 0);
    }, 0);

    return {
      scraperName,
      period: {
        days,
        from: since,
        to: new Date(),
      },
      summary: {
        totalRuns: runs.length,
        totalEvents,
        totalErrors,
        avgEventsPerRun: runs.length > 0 ? totalEvents / runs.length : 0,
      },
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        eventsFound: r.eventsFound,
        eventsNew: r.eventsNew,
        eventsUpdated: r.eventsUpdated,
        errorMessage: r.errorMessage,
        duration: r.metadata ? (r.metadata as any).duration : null,
      })),
    };
  }

  /**
   * Clean up old scraper runs
   */
  async cleanupOldRuns(daysToKeep: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const deleted = await prisma.scraperRun.deleteMany({
      where: {
        startedAt: { lt: cutoffDate },
      },
    });

    logger.info(`Cleaned up ${deleted.count} old scraper runs`);
    return deleted.count;
  }
}

/**
 * Singleton monitor instance
 */
export const scraperMonitor = new ScraperMonitor();

/**
 * Start monitoring (check health every hour)
 */
export function startMonitoring() {
  logger.info('Starting scraper monitoring...');

  // Check immediately
  scraperMonitor.checkAndAlert();

  // Check every hour
  const interval = setInterval(() => {
    scraperMonitor.checkAndAlert();
  }, 60 * 60 * 1000); // 1 hour

  // Cleanup old runs daily
  const cleanupInterval = setInterval(() => {
    scraperMonitor.cleanupOldRuns();
  }, 24 * 60 * 60 * 1000); // 24 hours

  return () => {
    clearInterval(interval);
    clearInterval(cleanupInterval);
  };
}
