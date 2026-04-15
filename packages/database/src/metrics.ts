export class PrismaMetrics {
  private queryCount = 0;
  private errorCount = 0;
  private slowQueryCount = 0;
  private totalQueryTime = 0;
  private readonly startTime = Date.now();

  incrementQuery(duration?: number) {
    this.queryCount++;
    if (duration) {
      this.totalQueryTime += duration;
    }
  }

  incrementError() {
    this.errorCount++;
  }

  incrementSlowQuery() {
    this.slowQueryCount++;
  }

  getMetrics() {
    const uptime = Date.now() - this.startTime;
    return {
      queries: this.queryCount,
      errors: this.errorCount,
      slowQueries: this.slowQueryCount,
      totalQueryTime: this.totalQueryTime,
      averageQueryTime:
        this.queryCount > 0 ? this.totalQueryTime / this.queryCount : 0,
      uptimeMs: uptime,
      queriesPerSecond: this.queryCount / (uptime / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  reset() {
    this.queryCount = 0;
    this.errorCount = 0;
    this.slowQueryCount = 0;
    this.totalQueryTime = 0;
  }
}

export const metrics = new PrismaMetrics();
