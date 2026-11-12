/**
 * Writes a number as a plain decimal without exponent or grouping, so that the text re-parses to
 * exactly the same number (`docs/PROJECT_REQUIREMENTS.md` §10.5), e.g. `1e-7` → `0.0000001`.
 * Non-finite values are returned as `String(value)` and are rejected by the monetary parser.
 */
export function toPlainDecimal(value: number): string {
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/i.exec(text);

  if (!Number.isFinite(value) || !match) {
    return text;
  }

  const [, sign = '', whole = '', fraction = '', exponentText = '0'] = match;
  const digits = whole + fraction;
  const pointIndex = whole.length + Number(exponentText);

  if (pointIndex <= 0) {
    return `${sign}0.${'0'.repeat(-pointIndex)}${digits}`;
  }

  if (pointIndex >= digits.length) {
    return `${sign}${digits}${'0'.repeat(pointIndex - digits.length)}`;
  }

  return `${sign}${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`;
}
