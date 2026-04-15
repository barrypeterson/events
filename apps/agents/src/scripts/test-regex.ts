#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function testRegex() {
  try {
    const pattern = 'sweet.*spots.*dance';
    const testStrings = [
      'sweet spots dance party',
      'sweet spots free afternoon dance party',
      'sweet spots',
      'dance party',
      'other event',
    ];

    console.log(`Testing PostgreSQL regex pattern: "${pattern}"\n`);

    for (const testStr of testStrings) {
      const result = await prisma.$queryRaw<Array<{ matches: boolean }>>`
        SELECT (${testStr} ~ ${pattern}) as matches
      `;

      console.log(`"${testStr}"`);
      console.log(`  Matches: ${result[0].matches ? '✓ YES' : '✗ NO'}`);
      console.log();
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await disconnect();
  }
}

testRegex();
