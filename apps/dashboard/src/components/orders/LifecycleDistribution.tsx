import React from 'react';
import { Typography, Card } from '@kpi-platform/ui';

export interface LifecycleStage {
  stage: string;
  count: number;
  color: string;
}

export interface LifecycleDistributionProps {
  stages: LifecycleStage[];
  loading?: boolean;
}

export const LifecycleDistribution: React.FC<LifecycleDistributionProps> = ({ stages, loading }) => {
  const total = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <Typography variant="h3" weight="bold" noMargin className="text-base uppercase tracking-wider text-text-muted">
          Lifecycle Progression
        </Typography>
        <Typography variant="caption" className="text-text-muted">
          Current Distribution ({total} total)
        </Typography>
      </div>

      {loading ? (
        <div className="h-4 bg-muted animate-pulse rounded-full" />
      ) : (
        <div className="space-y-6">
          <div className="flex h-4 w-full rounded-full overflow-hidden bg-muted">
            {stages.map((stage, idx) => (
              <div 
                key={idx}
                className="h-full transition-all duration-500"
                style={{ 
                  width: `${(stage.count / total) * 100}%`,
                  backgroundColor: stage.color
                }}
                title={`${stage.stage}: ${stage.count}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {stages.map((stage, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                  <Typography variant="caption" weight="bold" noMargin className="truncate">
                    {stage.stage}
                  </Typography>
                </div>
                <Typography variant="body" weight="bold" className="text-sm">
                  {stage.count}
                </Typography>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};
