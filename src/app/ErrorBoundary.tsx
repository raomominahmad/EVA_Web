import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('EVA render error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className={styles.fallback} role="alert">
          <p className={styles.label}>Something went wrong</p>
          <h1 className={styles.title}>EVA could not render this view</h1>
          <p className={styles.body}>
            Your inputs have not been sent anywhere. Reload the application to try again.
          </p>
          <Button onClick={() => window.location.reload()}>Reload application</Button>
        </div>
      );
    }

    return this.props.children;
  }
}
