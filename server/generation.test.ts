import { describe, expect, it, vi } from 'vitest';
import { createProviderGenerator, notConfiguredGenerator } from './generation';
import type { AiProviderAdapter, ProviderResult } from './generation';
import { PROVIDER_SCHEMA, SUMMARY_SYSTEM_PROMPT, buildUserMessage } from './summaryPrompt';
import { fixtureInput, validContent } from './testSupport';

function adapterReturning(result: ProviderResult) {
  const generate = vi.fn<AiProviderAdapter['generate']>(() => Promise.resolve(result));
  return { adapter: { generate }, generate };
}

const signal = new AbortController().signal;

describe('createProviderGenerator', () => {
  it('sends the prompt, the server-built data, and the schema, and returns validated content', async () => {
    const input = fixtureInput();
    const { adapter, generate } = adapterReturning({
      ok: true,
      text: JSON.stringify(validContent()),
    });
    const result = await createProviderGenerator(adapter, 'openai/gpt-oss-120b')(input, signal);

    expect(result).toEqual({
      ok: true,
      content: validContent(),
      modelLabel: 'openai/gpt-oss-120b',
    });
    expect(generate).toHaveBeenCalledWith(
      {
        system: SUMMARY_SYSTEM_PROMPT,
        data: buildUserMessage(input.modelData),
        schema: PROVIDER_SCHEMA,
      },
      signal,
    );
  });

  it('rejects provider output that fails validation instead of repairing it', async () => {
    const content = validContent();
    content.summary = 'CPI is 0.83.'; // Rounded: not a supplied display value.
    const { adapter } = adapterReturning({ ok: true, text: JSON.stringify(content) });
    expect(await createProviderGenerator(adapter, 'm')(fixtureInput(), signal)).toEqual({
      ok: false,
      code: 'invalid_ai_response',
    });
  });

  it('passes provider failures through unchanged and calls the provider once', async () => {
    const { adapter, generate } = adapterReturning({
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: 3,
    });
    expect(await createProviderGenerator(adapter, 'm')(fixtureInput(), signal)).toEqual({
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: 3,
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('keeps the not-configured generator as a plain 503 without a provider', async () => {
    expect(await notConfiguredGenerator(fixtureInput(), signal)).toEqual({
      ok: false,
      code: 'ai_not_configured',
    });
  });
});
