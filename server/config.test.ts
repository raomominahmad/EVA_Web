import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ALLOWED_GROQ_MODELS, ConfigError, FRONTEND_ORIGINS, loadConfig } from './config';
import { TEST_API_KEY } from './testSupport';

const MODEL = 'openai/gpt-oss-120b';

describe('loadConfig', () => {
  it('accepts only openai/gpt-oss-120b; there is no fallback model', () => {
    expect(ALLOWED_GROQ_MODELS).toEqual([MODEL]);
  });

  it('configures Groq only when both the key and the approved model are set', () => {
    const config = loadConfig({ GROQ_API_KEY: TEST_API_KEY, GROQ_MODEL: MODEL });
    expect(config.groq?.model).toBe(MODEL);
    expect(config.groq?.apiKey.reveal()).toBe(TEST_API_KEY);
    expect(config.missing).toEqual([]);
  });

  it('stays not configured (503) when the key or the model is missing', () => {
    expect(loadConfig({})).toEqual({ groq: null, missing: ['GROQ_API_KEY', 'GROQ_MODEL'] });
    expect(loadConfig({ GROQ_API_KEY: TEST_API_KEY })).toEqual({
      groq: null,
      missing: ['GROQ_MODEL'],
    });
    expect(loadConfig({ GROQ_API_KEY: '', GROQ_MODEL: MODEL })).toEqual({
      groq: null,
      missing: ['GROQ_API_KEY'],
    });
  });

  it.each(['openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'OPENAI/GPT-OSS-120B', 'gpt-oss-120b'])(
    'refuses the unsupported model %s instead of using it',
    (model) => {
      const run = () => loadConfig({ GROQ_API_KEY: TEST_API_KEY, GROQ_MODEL: model });
      expect(run).toThrow(ConfigError);
      expect(run).toThrow(/GROQ_MODEL is not supported/);
    },
  );

  it('never reveals the key when the configuration is printed or serialized', () => {
    const config = loadConfig({ GROQ_API_KEY: TEST_API_KEY, GROQ_MODEL: MODEL });
    for (const printed of [
      JSON.stringify(config),
      inspect(config, { depth: 10 }),
      inspect(config, { depth: 10, showHidden: true }),
      String(config.groq?.apiKey),
      `${String(config.groq?.apiKey)}`,
    ]) {
      expect(printed).not.toContain(TEST_API_KEY);
    }
    expect(JSON.stringify(config)).toContain('[REDACTED]');
  });

  it('refuses VITE_-prefixed secrets, naming the variable but not its value', () => {
    const run = () => loadConfig({ VITE_GROQ_API_KEY: 'value-that-must-not-leak' });
    expect(run).toThrow(ConfigError);
    expect(run).toThrow(/VITE_GROQ_API_KEY/);
    expect(run).not.toThrow(/value-that-must-not-leak/);
  });

  it('rejects a key containing whitespace without echoing it', () => {
    const run = () => loadConfig({ GROQ_API_KEY: 'abc def', GROQ_MODEL: MODEL });
    expect(run).toThrow(/GROQ_API_KEY contains whitespace/);
    expect(run).not.toThrow(/abc def/);
  });

  it('allows only the local Vite origin', () => {
    expect(FRONTEND_ORIGINS).toEqual(['http://127.0.0.1:5173', 'http://localhost:5173']);
  });
});
