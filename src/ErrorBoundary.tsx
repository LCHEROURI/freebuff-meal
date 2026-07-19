import { Component, type ErrorInfo, type ReactNode } from 'react';

type State = { error?: Error };
type Props = { children: ReactNode; fallback?: ReactNode };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  override render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-ink-500">
              We hit a snag rendering the page. Please refresh to try again.
            </p>
            <button
              type="button"
              className="btn-primary mt-6"
              onClick={() => window.location.reload()}
            >
              Refresh
            </button>
          </main>
        )
      );
    }
    return this.props.children;
  }
}
