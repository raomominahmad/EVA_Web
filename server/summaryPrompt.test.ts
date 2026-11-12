import { describe, expect, it } from 'vitest';
import { ASSESSMENTS, EVIDENCE_KEYS } from './contract';
import { PROVIDER_SCHEMA, SUMMARY_SYSTEM_PROMPT, buildUserMessage } from './summaryPrompt';
import { fixtureInput, validContent } from './testSupport';

type Schema = Record<string, unknown>;

/** Every object schema reachable from `schema`, including `$defs`. */
function objectSchemas(schema: unknown, found: Schema[] = []): Schema[] {
  if (Array.isArray(schema)) {
    for (const item of schema) objectSchemas(item, found);
  } else if (typeof schema === 'object' && schema !== null) {
    const record = schema as Schema;
    if (record.type === 'object') found.push(record);
    for (const value of Object.values(record)) objectSchemas(value, found);
  }
  return found;
}

describe('provider schema (Groq strict mode)', () => {
  it('closes every object and requires every property', () => {
    const objects = objectSchemas(PROVIDER_SCHEMA);
    expect(objects.length).toBe(3);
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false);
      expect([...(object.required as string[])].sort()).toEqual(
        Object.keys(object.properties as Schema).sort(),
      );
    }
  });

  it('keeps the contract sections, the assessment enum, and the evidence-key allowlist', () => {
    expect(PROVIDER_SCHEMA.required).toEqual([
      'summary',
      'observations',
      'costRisks',
      'recommendations',
      'limitations',
    ]);
    expect(PROVIDER_SCHEMA.$defs.evidenceKey.enum).toEqual([...EVIDENCE_KEYS]);
    expect(PROVIDER_SCHEMA.$defs.observation.properties.assessment.enum).toEqual([...ASSESSMENTS]);
  });

  it('omits only the keywords Groq does not document for strict mode', () => {
    expect(JSON.stringify(PROVIDER_SCHEMA)).not.toMatch(
      /minItems|maxItems|minLength|maxLength|uniqueItems|pattern|format/,
    );
  });

  it('describes a shape that the valid fixture content satisfies', () => {
    const content = validContent();
    expect(Object.keys(content)).toEqual(PROVIDER_SCHEMA.required);
    expect(Object.keys(content.observations[0] ?? {})).toEqual(
      PROVIDER_SCHEMA.$defs.observation.required,
    );
    expect(Object.keys(content.costRisks[0] ?? {})).toEqual(PROVIDER_SCHEMA.$defs.item.required);
  });
});

describe('prompt', () => {
  it('states the critical rules and the limits that the schema cannot carry', () => {
    for (const phrase of [
      'experienced project cost analyst',
      'Never calculate, estimate, round',
      'never treat it as zero',
      'it is not CV',
      'EAC is a forecast and never the budget',
      'a favorable SPI never means favorable cost performance',
      'Distinguish facts from interpretations',
      'at most 600 characters',
      'at most 400 characters',
      '1 to 6 observations',
      '1 to 4, no duplicates',
      // Lab requirement: cost and schedule performance explained with CPI, SPI, CV, and SV.
      'evidence contains both "cpi" and "cv"',
      'evidence contains both "spi" and "sv"',
    ]) {
      expect(SUMMARY_SYSTEM_PROMPT).toContain(phrase);
    }
  });

  it('wraps only the server-built facts document as data, with no project metadata', () => {
    const message = buildUserMessage(fixtureInput().modelData);
    expect(message.startsWith('<eva_data>{')).toBe(true);
    expect(message.endsWith('}</eva_data>')).toBe(true);
    expect(message).not.toMatch(/projectName|description|manager|reportingDate/);
    expect(message).toContain('"display":"$100,000.00"');
  });
});
