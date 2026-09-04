import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { message?: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { message: error.message || 'Something went wrong.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('HerdLedger crashed', error, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <div className="page" style={{ padding: '2rem' }}>
          <h1>HerdLedger hit a snag</h1>
          <p className="lede">{this.state.message}</p>
          <p className="hint">
            Reload. If it stays stuck, clear this app’s data and open it again.
          </p>
          <div className="sticky-actions" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
