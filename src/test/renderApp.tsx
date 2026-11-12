import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '@/app/App';

/**
 * Renders the app and, when it opens on the landing page (a new tab with nothing saved), starts
 * the workflow with "Create a project", as a user would. With saved work the app reopens at the
 * saved step and no landing page is shown, so nothing is clicked.
 */
export function renderApp() {
  const view = render(<App />);
  const [start] = screen.queryAllByRole('button', { name: 'Create a project' });

  if (start) {
    fireEvent.click(start);
  }

  return view;
}
