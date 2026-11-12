import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignedNumber } from './SignedNumber';

describe('SignedNumber (A2)', () => {
  it('keeps the minus sign, currency symbol, and first digit group together', () => {
    const { container } = render(
      <p>
        <SignedNumber text="-¥81,129,638,414,606,700,000" />
      </p>,
    );
    expect(container.textContent).toBe('-¥81,129,638,414,606,700,000');
    expect(container.querySelector('span')?.textContent).toBe('-¥81');
  });

  it('leaves positive values, ratios, and N/A as plain text', () => {
    for (const text of ['$58,000.00', '0.8333', 'N/A', '<0.0001']) {
      const { container, unmount } = render(
        <p>
          <SignedNumber text={text} />
        </p>,
      );
      expect(container.textContent).toBe(text);
      expect(container.querySelector('span')).toBeNull();
      unmount();
    }
  });

  it('handles negative ratios and percentages', () => {
    const { container } = render(
      <p>
        <SignedNumber text="-50.0%" />
      </p>,
    );
    expect(container.querySelector('span')?.textContent).toBe('-50');
    expect(container.textContent).toBe('-50.0%');
  });
});
