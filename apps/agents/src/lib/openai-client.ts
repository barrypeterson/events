import OpenAI from 'openai';
import { logger } from './scraper-utils';

/**
 * Centralized OpenAI client with request/response logging.
 *
 * Replaces the per-file `getOpenAI()` factories scattered across the agents
 * codebase. Every call to `client.chat.completions.create` now emits:
 *   [openai][req] model=... messages=N input_chars=N max_tokens=N
 *   [openai][res] model=... prompt_tokens=N completion_tokens=N finish=... ms=N preview="..."
 *
 * Preview is truncated to 300 chars of single-spaced content so giant JSON
 * responses don't flood the log file.
 *
 * Streaming calls (params.stream === true) are passed through without
 * response logging — we'd need to tee the stream otherwise. None of our
 * current callers stream.
 */

let cached: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (cached) return cached;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  const client = new OpenAI({ apiKey });
  const origCreate = client.chat.completions.create.bind(client.chat.completions);

  (client.chat.completions as any).create = async (params: any, options?: any) => {
    const start = Date.now();
    const model = params?.model ?? 'unknown';
    const msgCount = Array.isArray(params?.messages) ? params.messages.length : 0;
    const inputChars = Array.isArray(params?.messages)
      ? params.messages.reduce(
          (n: number, m: any) => n + (typeof m?.content === 'string' ? m.content.length : 0),
          0,
        )
      : 0;
    const roles = Array.isArray(params?.messages)
      ? params.messages.map((m: any) => m?.role ?? '?').join(',')
      : '';
    logger.info(
      `[openai][req] model=${model} messages=${msgCount} roles=${roles} input_chars=${inputChars} max_tokens=${params?.max_tokens ?? '-'} temperature=${params?.temperature ?? '-'}`,
    );

    if (params?.stream === true) {
      try {
        const stream = await origCreate(params, options);
        logger.info(`[openai][stream-start] model=${model} ms=${Date.now() - start}`);
        return stream;
      } catch (err: any) {
        logger.error(
          `[openai][error] model=${model} ms=${Date.now() - start} error="${err?.message || err}"`,
        );
        throw err;
      }
    }

    try {
      const res = await origCreate(params, options);
      const usage = (res as any)?.usage ?? {};
      const choice = (res as any)?.choices?.[0];
      const content = choice?.message?.content ?? '';
      const finish = choice?.finish_reason ?? 'unknown';
      const preview = String(content).slice(0, 300).replace(/\s+/g, ' ');
      logger.info(
        `[openai][res] model=${model} prompt_tokens=${usage.prompt_tokens ?? '?'} completion_tokens=${usage.completion_tokens ?? '?'} total_tokens=${usage.total_tokens ?? '?'} finish=${finish} content_chars=${String(content).length} ms=${Date.now() - start} preview="${preview}"`,
      );
      return res;
    } catch (err: any) {
      logger.error(
        `[openai][error] model=${model} ms=${Date.now() - start} error="${err?.message || err}"`,
      );
      throw err;
    }
  };

  cached = client;
  return client;
}
