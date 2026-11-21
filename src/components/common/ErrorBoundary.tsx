import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  title?: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || 'Render error occurred.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center border border-amber-500/30 bg-[#0B1120] p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400 mb-3" />
          <h3 className="font-display text-base font-semibold text-slate-100">
            {this.props.title ?? 'Module Visualization Fallback'}
          </h3>
          <p className="mt-1.5 max-w-md text-xs text-slate-400">{this.state.errorMessage}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
            className="mt-4 inline-flex items-center gap-2 border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-100 hover:bg-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reload Module
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
