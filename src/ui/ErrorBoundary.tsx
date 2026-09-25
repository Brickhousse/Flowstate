import { Component, type ReactNode } from 'react';
import { openAnotherProject } from '../boot';

interface State {
  error: Error | null;
  busy: boolean;
  failure: string | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, busy: false, failure: null };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  escape = async () => {
    this.setState({ busy: true, failure: null });
    try {
      await openAnotherProject();
    } catch (err) {
      this.setState({ busy: false, failure: err instanceof Error ? err.message : String(err) });
    }
  };

  render() {
    const { error, busy, failure } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="boot boot-error" role="alert">
        <div className="boot-error-body">
          <p>Flowstate could not display this project.</p>
          <pre>{error.message}</pre>
          <button type="button" onClick={this.escape} disabled={busy}>
            Open another project
          </button>
          {failure && <p>{failure}</p>}
        </div>
      </div>
    );
  }
}
