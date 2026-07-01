'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Activity, TrendingUp, TrendingDown, Minus, AlertTriangle, Shield } from 'lucide-react';
import NavBar from '@/components/NavBar';
import { getCurrentUser } from '@/lib/supabase-client';
import {
  fetchHealthSnapshots,
  analyzeHealthTrend,
  getOverallAlertLevel,
  fetchEnvironmentsFromAnalyses,
  HealthSnapshot,
  TrendAnalysis,
} from '@/lib/health-monitoring-service';

const METRIC_LABELS: Record<string, string> = {
  heapUsage: 'Heap JVM',
  cpuUsage: 'CPU',
  memoryUsage: 'Memoria RAM',
  diskUsage: 'Disco',
};

const ALERT_COLORS: Record<string, string> = {
  normal: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  critical: 'bg-destructive/10 text-destructive',
};

export default function MonitoringPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [environments, setEnvironments] = useState<string[]>([]);
  const [selectedEnv, setSelectedEnv] = useState('');
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>([]);
  const [trends, setTrends] = useState<TrendAnalysis[]>([]);
  const [overallAlert, setOverallAlert] = useState<string>('normal');
  const [aiPrediction, setAiPrediction] = useState<any>(null);
  const [isPredicting, setIsPredicting] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser();
      if (!user) { router.push('/auth/login'); return; }
      setIsAuthenticated(true);
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchEnvironmentsFromAnalyses().then(names => {
        setEnvironments(names);
        setIsLoading(false);
      });
    }
  }, [isAuthenticated]);

  const loadSnapshots = useCallback(async (envName: string) => {
    if (!envName) return;
    setIsLoading(true);
    try {
      const data = await fetchHealthSnapshots(envName, 90);
      setSnapshots(data);
      const trendData = analyzeHealthTrend(data);
      setTrends(trendData);
      setOverallAlert(getOverallAlertLevel(trendData));
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedEnv) loadSnapshots(selectedEnv);
  }, [selectedEnv, loadSnapshots]);

  const handlePredict = async () => {
    if (trends.length === 0) {
      toast({ title: 'Aviso', description: 'Sem dados suficientes para predicao', variant: 'destructive' });
      return;
    }
    setIsPredicting(true);
    try {
      const response = await fetch('/api/ai/health-predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trends, snapshots: snapshots.length, environmentName: selectedEnv }),
      });
      if (response.ok) {
        setAiPrediction(await response.json());
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsPredicting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <NavBar />
      <div className="max-w-6xl mx-auto pt-28 px-6 pb-12">
        <div className="animate-slide-up mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Monitoramento Preditivo</h1>
          <p className="text-muted-foreground mt-2 text-sm">Analise tendencias de saude e preveja falhas antes que acontecam</p>
        </div>

        {/* Environment Selector - Prominent */}
        <div className="animate-slide-up mb-6">
          <Card className="border-border/60 rounded-xl">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Select value={selectedEnv} onValueChange={setSelectedEnv}>
                    <SelectTrigger className="rounded-lg">
                      <SelectValue placeholder="Selecione o ambiente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {environments.map(env => (
                        <SelectItem key={env} value={env}>{env}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedEnv && (
                  <Badge className={`${ALERT_COLORS[overallAlert]} border-0 rounded-full`}>
                    {overallAlert === 'normal' ? 'Saudavel' : overallAlert === 'warning' ? 'Atencao' : 'Critico'}
                  </Badge>
                )}
                {snapshots.length > 0 && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{snapshots.length} snapshots / 90 dias</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : !selectedEnv ? (
          <Card className="border-border/60 rounded-xl">
            <CardContent className="flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm font-medium">Selecione um ambiente</p>
                <p className="text-xs text-muted-foreground mt-1">para visualizar as tendencias de saude</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6 animate-slide-up">
            {/* Trend Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {trends.length > 0 ? trends.map((trend) => {
                const getBgTint = () => {
                  if (trend.alertLevel === 'critical') return 'bg-destructive/5';
                  if (trend.alertLevel === 'warning') return 'bg-warning/5';
                  return 'bg-success/5';
                };
                const getBorderColor = () => {
                  if (trend.alertLevel === 'critical') return 'border-l-destructive';
                  if (trend.alertLevel === 'warning') return 'border-l-warning';
                  return 'border-l-success';
                };
                return (
                  <Card key={trend.metric} className={`border-border/60 rounded-xl border-l-4 ${getBorderColor()} ${getBgTint()}`}>
                    <CardContent className="pt-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {METRIC_LABELS[trend.metric] || trend.metric}
                        </span>
                        {trend.direction === 'up' ? (
                          <TrendingUp className="h-4 w-4 text-destructive" />
                        ) : trend.direction === 'down' ? (
                          <TrendingDown className="h-4 w-4 text-success" />
                        ) : (
                          <Minus className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="text-3xl font-bold">{trend.currentValue}%</div>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-xs text-muted-foreground">Media: {trend.averageValue}%</span>
                        <Badge
                          variant="outline"
                          className={`text-xs rounded-full border-0 ${
                            trend.changePercent > 0 ? 'bg-destructive/10 text-destructive' :
                            trend.changePercent < 0 ? 'bg-success/10 text-success' :
                            'bg-muted/50 text-muted-foreground'
                          }`}
                        >
                          {trend.changePercent > 0 ? '+' : ''}{trend.changePercent}%
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              }) : (
                <div className="col-span-4 text-center py-8">
                  <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground font-medium">Sem dados suficientes</p>
                  <p className="text-xs text-muted-foreground mt-1">Execute analises de ambiente com health check</p>
                </div>
              )}
            </div>

            {/* AI Prediction */}
            <Card className="border-border/60 rounded-xl border-primary/20">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Shield className="h-5 w-5 text-primary" />
                    Predicao com IA
                  </CardTitle>
                  <Button
                    onClick={handlePredict}
                    disabled={isPredicting || trends.length === 0}
                    className="bg-primary hover:bg-primary/90 rounded-lg"
                  >
                    {isPredicting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analisando...
                      </>
                    ) : (
                      'Gerar Predicao'
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {aiPrediction ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
                      <p className="text-sm text-foreground">{aiPrediction.prediction}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-3 border border-border/60 rounded-lg bg-muted/30">
                        <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Tempo Estimado</p>
                        <p className="text-sm font-medium text-foreground">{aiPrediction.estimatedTimeToIssue}</p>
                      </div>
                      <div className="p-3 border border-border/60 rounded-lg bg-muted/30">
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Nivel de Risco</p>
                        <Badge
                          className={`rounded-full border-0 ${
                            aiPrediction.overallRisk === 'critical' ? 'bg-destructive/10 text-destructive' :
                            aiPrediction.overallRisk === 'high' ? 'bg-warning/10 text-warning' :
                            aiPrediction.overallRisk === 'medium' ? 'bg-warning/10 text-warning' :
                            'bg-success/10 text-success'
                          }`}
                        >
                          {aiPrediction.overallRisk}
                        </Badge>
                      </div>
                    </div>
                    {aiPrediction.preventiveActions?.length > 0 && (
                      <div className="pt-2">
                        <p className="text-sm font-medium mb-3 text-foreground">Acoes Preventivas</p>
                        <ol className="space-y-2">
                          {aiPrediction.preventiveActions.map((a: string, i: number) => (
                            <li key={i} className="text-sm text-muted-foreground flex gap-2">
                              <span className="text-primary font-medium flex-shrink-0">{i + 1}.</span>
                              <span>{a}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Clique em &quot;Gerar Predicao&quot; para uma analise preditiva baseada nos dados coletados.</p>
                )}
              </CardContent>
            </Card>

            {/* Recent Snapshots Timeline */}
            {snapshots.length > 0 && (
              <Card className="border-border/60 rounded-xl">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base font-semibold">Historico de Snapshots</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-background border-b border-border/60">
                        <tr>
                          <th className="text-left p-3 text-muted-foreground font-medium">Data</th>
                          <th className="text-center p-3 text-muted-foreground font-medium">Heap</th>
                          <th className="text-center p-3 text-muted-foreground font-medium">CPU</th>
                          <th className="text-center p-3 text-muted-foreground font-medium">Memoria</th>
                          <th className="text-center p-3 text-muted-foreground font-medium">Disco</th>
                          <th className="text-center p-3 text-muted-foreground font-medium">Alerta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshots.slice(-10).reverse().map((snap, idx) => (
                          <tr key={snap.id} className={`border-b border-border/40 ${idx % 2 === 0 ? 'bg-muted/30' : ''} hover:bg-muted/50 transition-colors`}>
                            <td className="p-3 text-foreground">{new Date(snap.createdAt!).toLocaleString('pt-BR')}</td>
                            <td className="p-3 text-center text-foreground">{snap.snapshotData.heapUsage ?? '-'}%</td>
                            <td className="p-3 text-center text-foreground">{snap.snapshotData.cpuUsage ?? '-'}%</td>
                            <td className="p-3 text-center text-foreground">{snap.snapshotData.memoryUsage ?? '-'}%</td>
                            <td className="p-3 text-center text-foreground">{snap.snapshotData.diskUsage ?? '-'}%</td>
                            <td className="p-3 text-center">
                              <Badge className={`${ALERT_COLORS[snap.alertLevel]} border-0 rounded-full text-xs`}>
                                {snap.alertLevel}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
