import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PerformanceIssue } from '@/lib/types';
import { Gauge, Clock, AlertTriangle, Info } from 'lucide-react';

interface PerformanceDetailsProps {
  issue: PerformanceIssue;
  index: number;
}

export function PerformanceDetails({ issue, index }: PerformanceDetailsProps) {
  const getTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      'DATASET_SYNC': 'text-chart-1 border-chart-1/50 bg-chart-1/10',
      'DATASET_EXECUTION': 'text-chart-2 border-chart-2/50 bg-chart-2/10',
      'WORKFLOW': 'text-chart-3 border-chart-3/50 bg-chart-3/10',
      'MEMORY': 'text-chart-4 border-chart-4/50 bg-chart-4/10',
      'DATABASE': 'text-chart-5 border-chart-5/50 bg-chart-5/10',
      'OTHER': 'text-muted-foreground border-muted/50 bg-muted/20'
    };
    
    return colors[type] || colors['OTHER'];
  };

  const translateType = (type: string): string => {
    const translations: Record<string, string> = {
      'DATASET_SYNC': 'Sincronização de Dataset',
      'DATASET_EXECUTION': 'Execução de Dataset',
      'WORKFLOW': 'Workflow',
      'MEMORY': 'Memória',
      'DATABASE': 'Banco de Dados',
      'OTHER': 'Outros'
    };
    
    return translations[type] || type;
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-chart-2 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{issue.message}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={getTypeColor(issue.type)}>
                    {translateType(issue.type)}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {issue.timestamp}
                  </span>
                  {issue.duration && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {issue.duration}s
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {issue.context && (
            <div className="mt-2">
              <p className="text-sm font-medium mb-1 flex items-center gap-1">
                <Info className="h-4 w-4" />
                Contexto
              </p>
              <ScrollArea className="h-[100px] w-full rounded-md border p-2">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {issue.context}
                </pre>
              </ScrollArea>
            </div>
          )}

          <div className="mt-2 p-3 bg-muted/20 rounded-md">
            <p className="text-sm">
              <span className="font-medium">Sugestão: </span>
              {issue.suggestion}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}