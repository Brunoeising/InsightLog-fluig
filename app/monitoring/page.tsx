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
  normal: 'bg-green-100 text-green-700 border-green-300',
  warning: 'bg-amber-100 text-amber-700 border-amber-300',
  critical: 'bg-red-100 text-red-700 border-red-300',
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
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main>;
  }

  return (
    <main className="min-h-screen bg-background">
      <NavBar />
      <div className="max-w-6xl mx-auto pt-28 px-6 pb-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Monitoramento Preditivo</h1>
            <p className="text-muted-foreground mt-1">Analise tendencias de saude e preveja falhas antes que acontecam</p>
          </div>
        </div>

        {/* Environment Selector */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Select value={selectedEnv} onValueChange={setSelectedEnv}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Selecione o ambiente..." />
                </SelectTrigger>
                <SelectContent>
                  {environments.map(env => (
                    <SelectItem key={env} value={env}>{env}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedEnv && (
                <Badge className={ALERT_COLORS[overallAlert]}>
                  {overallAlert === 'normal' ? 'Saudavel' : overallAlert === 'warning' ? 'Atencao' : 'Critico'}
                </Badge>
              )}
              {snapshots.length > 0 && (
                <span className="text-sm text-muted-foreground">{snapshots.length} snapshots nos ultimos 90 dias</span>
              )}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !selectedEnv ? (
          <Card>
            <CardContent className="flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Selecione um ambiente para visualizar as tendencias de saude.</p>
                <p className="text-sm text-muted-foreground mt-2">Os dados sao coletados a partir das analises de ambiente realizadas.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Trend Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {trends.length > 0 ? trends.map((trend) => (
                <Card key={trend.metric} className={`border-l-4 ${
                  trend.alertLevel === 'critical' ? 'border-l-red-500' :
                  trend.alertLevel === 'warning' ? 'border-l-amber-500' : 'border-l-green-500'
                }`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{METRIC_LABELS[trend.metric] || trend.metric}</span>
                      {trend.direction === 'up' ? <TrendingUp className="h-4 w-4 text-red-500" /> :
                       trend.direction === 'down' ? <TrendingDown className="h-4 w-4 text-green-500" /> :
                       <Minus className="h-4 w-4 text-gray-400" />}
                    </div>
                    <div className="text-2xl font-bold">{trend.currentValue}%</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">Media: {trend.averageValue}%</span>
                      <Badge variant="outline" className={`text-xs ${
                        trend.changePercent > 0 ? 'text-red-600' : trend.changePercent < 0 ? 'text-green-600' : ''
                      }`}>
                        {trend.changePercent > 0 ? '+' : ''}{trend.changePercent}%
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )) : (
                <div className="col-span-4 text-center text-muted-foreground py-8">
                  <p>Sem snapshots suficientes para analise de tendencia.</p>
                  <p className="text-sm mt-1">Execute analises de ambiente com health check para gerar dados.</p>
                </div>
              )}
            </div>

            {/* AI Prediction */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-[#245C90]" />
                    Predicao com IA
                  </CardTitle>
                  <Button onClick={handlePredict} disabled={isPredicting || trends.length === 0} className="bg-[#245C90] hover:bg-[#1e4d7a]">
                    {isPredicting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analisando...</> : 'Gerar Predicao'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {aiPrediction ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                      <p className="text-sm">{aiPrediction.prediction}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-3 border rounded-lg">
                        <p className="text-sm font-medium mb-1">Tempo Estimado para Problema</p>
                        <p className="text-sm text-muted-foreground">{aiPrediction.estimatedTimeToIssue}</p>
                      </div>
                      <div className="p-3 border rounded-lg">
                        <p className="text-sm font-medium mb-1">Nivel de Risco</p>
                        <Badge className={
                          aiPrediction.overallRisk === 'critical' ? 'bg-red-100 text-red-700' :
                          aiPrediction.overallRisk === 'high' ? 'bg-orange-100 text-orange-700' :
                          aiPrediction.overallRisk === 'medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-green-100 text-green-700'
                        }>{aiPrediction.overallRisk}</Badge>
                      </div>
                    </div>
                    {aiPrediction.preventiveActions?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Acoes Preventivas:</p>
                        <ol className="list-decimal list-inside space-y-1">
                          {aiPrediction.preventiveActions.map((a: string, i: number) => (
                            <li key={i} className="text-sm">{a}</li>
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
              <Card>
                <CardHeader><CardTitle className="text-base">Historico de Snapshots</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Data</th>
                          <th className="text-center p-2">Heap</th>
                          <th className="text-center p-2">CPU</th>
                          <th className="text-center p-2">Memoria</th>
                          <th className="text-center p-2">Disco</th>
                          <th className="text-center p-2">Alerta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshots.slice(-10).reverse().map((snap) => (
                          <tr key={snap.id} className="border-b hover:bg-muted/50">
                            <td className="p-2 text-xs">{new Date(snap.createdAt!).toLocaleString('pt-BR')}</td>
                            <td className="p-2 text-center">{snap.snapshotData.heapUsage ?? '-'}%</td>
                            <td className="p-2 text-center">{snap.snapshotData.cpuUsage ?? '-'}%</td>
                            <td className="p-2 text-center">{snap.snapshotData.memoryUsage ?? '-'}%</td>
                            <td className="p-2 text-center">{snap.snapshotData.diskUsage ?? '-'}%</td>
                            <td className="p-2 text-center">
                              <Badge variant="outline" className={`text-xs ${ALERT_COLORS[snap.alertLevel]}`}>{snap.alertLevel}</Badge>
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
