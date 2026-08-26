import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { message?: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { message: error.message || 'Something went wrong.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Record book crashed', error, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <div className="page" style={{ padding: '2rem' }}>
          <h1>Record book hit a snag</h1>
          <p className="lede">{this.state.message}</p>
          <p className="hint">Refresh the page. If it stays blank, clear this site’s data for this address.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
