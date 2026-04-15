import { Prisma } from '@prisma/client';
import { prisma } from './index';

export type TransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Execute a function within a Prisma transaction with customizable options
 * @param fn - Function to execute within the transaction
 * @param options - Transaction configuration options
 * @returns The result of the transaction function
 */
export async function withTransaction<T>(
  fn: (tx: TransactionClient) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  return prisma.$transaction(fn, {
    maxWait: options?.maxWait ?? 5000, // 5 seconds default
    timeout: options?.timeout ?? 10000, // 10 seconds default
    isolationLevel: options?.isolationLevel,
  });
}

/**
 * Connect to database with retry logic
 * @param maxRetries - Maximum number of connection attempts
 * @param delay - Delay between retries in milliseconds
 */
export async function connectWithRetry(
  maxRetries = 5,
  delay = 5000
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await prisma.$connect();
      console.log('✓ Database connected successfully');
      return;
    } catch (error) {
      console.error(
        `Failed to connect to database (attempt ${i + 1}/${maxRetries}):`,
        error
      );
      if (i < maxRetries - 1) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw new Error(
          `Failed to connect to database after ${maxRetries} attempts`
        );
      }
    }
  }
}

/**
 * Gracefully disconnect from database
 */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
  console.log('✓ Database disconnected');
}
