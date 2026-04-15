import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

/**
 * Request logging middleware
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  // Log request
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Capture original end function
  const originalEnd = res.end;

  // Override end function to log response
  res.end = function (
    ...args: any[]
  ): Response {
    const duration = Date.now() - start;

    logger.info('Outgoing response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('content-length'),
    });

    // Call original end function
    return (originalEnd as any).apply(res, args);
  };

  next();
}

/**
 * Error logging middleware
 */
export function errorLogger(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
    ip: req.ip,
  });

  next(err);
}
