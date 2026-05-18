'use client';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, Typography, Button } from '@kpi-platform/ui';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  section?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class DashboardSectionErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Uncaught error in dashboard section "${this.props.section || 'Unknown'}":`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="border-error/20 bg-error-bg/5 p-8 flex flex-col items-center justify-center text-center gap-4 min-h-[200px]">
          <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center text-error mb-2">
            <AlertCircle size={24} />
          </div>
          <div>
            <Typography variant="body" weight="bold" className="text-text-primary mb-1">
               Failed to load {this.props.section || 'this section'}
            </Typography>
            <Typography variant="micro" className="text-text-muted max-w-sm mx-auto">
              A component-level error occurred while rendering this widget. The rest of the dashboard remains functional.
            </Typography>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={this.handleReset}
            className="mt-2"
          >
            <RefreshCcw size={14} className="mr-2" /> Attempt Recovery
          </Button>
        </Card>
      );
    }

    return this.props.children;
  }
}
