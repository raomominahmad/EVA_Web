import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function BrokenView(): never {
  throw new Error('Test render failure');
}

describe('ErrorBoundary', () => {
  it('shows a recoverable fallback when a view throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('EVA could not render this view');
    expect(screen.getByRole('button', { name: 'Reload application' })).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });
});
