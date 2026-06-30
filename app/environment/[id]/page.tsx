'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft, Loader2, CheckCircle2, AlertTriangle, AlertCircle, XCircle,
  HelpCircle, FileDown, Sparkles, Cpu, Database, Server, Coffee, Activity, Gauge
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, RadialBarChart, RadialBar, Legend
} from 'recharts';
import NavBar from '@/components/NavBar';
import { getCurrentUser } from '@/lib/supabase-client';
import { fetchEnvironmentAnalysis, generateExecutiveSummary, saveExecutiveSummary } from '@/lib/environment-service';
import { EnvironmentAnalysis, CompatibilityStatus } from '@/lib/types';

const STATUS_COLORS: Record<CompatibilityStatus, string> = {
  HOMOLOGADO: '#22c55e',
  HOMOLOGADO_RESTRICOES: '#f59e0b',
  EM_ANALISE: '#a855f7',
  EM_VALIDACAO: '#3b82f6',
  NAO_HOMOLOGADO: '#ef4444',
  NAO_IDENTIFICADO: '#94a3b8',
};

const STATUS_LABELS: Record<CompatibilityStatus, string> = {
  HOMOLOGADO: 'Homologado',
  HOMOLOGADO_RESTRICOES: 'Homologado com Restricoes',
  EM_ANALISE: 'Em Analise (TOTVS)',
  EM_VALIDACAO: 'Em Validacao',
  NAO_HOMOLOGADO: 'Nao Homologado',
  NAO_IDENTIFICADO: 'Nao Identificado',
};

const STATUS_ICONS: Record<CompatibilityStatus, typeof CheckCircle2> = {
  HOMOLOGADO: CheckCircle2,
  HOMOLOGADO_RESTRICOES: AlertTriangle,
  EM_ANALISE: AlertCircle,
  EM_VALIDACAO: AlertCircle,
  NAO_HOMOLOGADO: XCircle,
  NAO_IDENTIFICADO: HelpCircle,
};

export default function EnvironmentDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [analysis, setAnalysis] = useState<EnvironmentAnalysis | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  const analysisId = params.id as string;

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }
      setIsAuthenticated(true);
    };
    checkAuth();
  }, [router]);

  const loadAnalysis = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchEnvironmentAnalysis(analysisId);
      if (!data) {
        toast({ title: 'Analise nao encontrada', variant: 'destructive' });
        router.push('/environment/history');
        return;
      }
      setAnalysis(data);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [analysisId, router, toast]);

  useEffect(() => {
    if (isAuthenticated) loadAnalysis();
  }, [isAuthenticated, loadAnalysis]);

  const handleGenerateSummary = useCallback(async () => {
    if (!analysis) return;
    setGeneratingSummary(true);
    try {
      const { summary, recommendations } = await generateExecutiveSummary(analysis);
      await saveExecutiveSummary(analysisId, summary, recommendations);
      setAnalysis(prev => prev ? { ...prev, executiveSummary: summary, recommendations } : null);
      toast({ title: 'Resumo executivo gerado', description: 'IA concluiu a analise.' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setGeneratingSummary(false);
    }
  }, [analysis, analysisId, toast]);

  if (!isAuthenticated || isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  if (!analysis) return null;

  const statusCounts = analysis.items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<CompatibilityStatus, number>);

  const pieData = Object.entries(statusCounts).map(([status, count]) => ({
    name: STATUS_LABELS[status as CompatibilityStatus],
    value: count,
    color: STATUS_COLORS[status as CompatibilityStatus],
  }));

  const sizingData = analysis.sizing ? [
    { name: 'CPU', atual: parseInt(analysis.sizing.currentCpu) || 0, recomendado: parseInt(analysis.sizing.recommendedCpu) || 0 },
    { name: 'RAM (GB)', atual: parseInt(analysis.sizing.currentRam) || 0, recomendado: parseInt(analysis.sizing.recommendedRam) || 0 },
    { name: 'Disco (GB)', atual: parseInt(analysis.sizing.currentDisk) || 0, recomendado: parseInt(analysis.sizing.recommendedDisk) || 0 },
  ] : [];

  const healthData = analysis.healthCheck ? [
    { name: 'Heap', value: analysis.healthCheck.heapUsage || 0, fill: '#245C90' },
    { name: 'CPU', value: analysis.healthCheck.cpuUsage || 0, fill: '#0ea5e9' },
    { name: 'Memoria', value: analysis.healthCheck.memoryUsage || 0, fill: '#22c55e' },
    { name: 'Disco', value: analysis.healthCheck.diskUsage || 0, fill: '#f59e0b' },
  ] : [];

  const itemsByCategory = analysis.items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof analysis.items>);

  const categoryIcons: Record<string, typeof Server> = {
    OS: Server, ARCHITECTURE: Cpu, JAVA: Coffee, DATABASE: Database,
    APPSERVER: Server, NGINX: Server, APACHE: Server,
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-secondary/10 text-foreground">
      <NavBar />

      <div className="max-w-7xl mx-auto pt-24 px-6 md:px-10 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Button variant="ghost" onClick={() => router.push('/environment/history')} className="mb-2 -ml-4">
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="text-3xl font-bold">{analysis.environmentName}</h1>
            <p className="text-muted-foreground">
              Analise realizada em {new Date(analysis.createdAt || '').toLocaleDateString('pt-BR')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/environment/${analysisId}/report?format=pdf`)}>
              <FileDown className="h-4 w-4 mr-2" /> PDF
            </Button>
            <Button variant="outline" onClick={() => router.push(`/environment/${analysisId}/report?format=html`)}>
              <FileDown className="h-4 w-4 mr-2" /> HTML
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Card className="border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Compatibilidade Geral</span>
                <Gauge className="h-5 w-5 text-primary" />
              </div>
              <div className="text-3xl font-bold">{analysis.compatibilityScore}%</div>
              <Progress value={analysis.compatibilityScore} className="mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Riscos</span>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div className="text-3xl font-bold text-amber-500">{analysis.riskCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Nao Homologados</span>
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div className="text-3xl font-bold text-red-500">{analysis.nonHomologatedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Em Analise (TOTVS)</span>
                <AlertCircle className="h-5 w-5 text-purple-500" />
              </div>
              <div className="text-3xl font-bold text-purple-500">{analysis.inAnalysisCount ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Em Atencao</span>
                <AlertCircle className="h-5 w-5 text-blue-500" />
              </div>
              <div className="text-3xl font-bold text-blue-500">{analysis.attentionCount}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Visao Geral</TabsTrigger>
            <TabsTrigger value="items">Itens Validados</TabsTrigger>
            <TabsTrigger value="sizing">Dimensionamento</TabsTrigger>
            {analysis.healthCheck && <TabsTrigger value="health">Health Check</TabsTrigger>}
            <TabsTrigger value="executive">Resumo Executivo</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Distribuicao de Compatibilidade</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Score de Compatibilidade</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadialBarChart innerRadius="30%" outerRadius="100%" data={[{ name: 'Score', value: analysis.compatibilityScore, fill: '#245C90' }]} startAngle={90} endAngle={-270}>
                      <RadialBar background dataKey="value" cornerRadius={10} />
                      <Legend iconType="circle" layout="vertical" verticalAlign="middle" align="right" />
                    </RadialBarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Items Tab */}
          <TabsContent value="items" className="space-y-6">
            {Object.entries(itemsByCategory).map(([category, items]) => {
              const Icon = categoryIcons[category] || Server;
              return (
                <Card key={category}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" /> {category}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {items.map((item, idx) => {
                        const StatusIcon = STATUS_ICONS[item.status];
                        const color = STATUS_COLORS[item.status];
                        return (
                          <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                            <StatusIcon className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{item.label}</span>
                                <Badge variant="outline" style={{ borderColor: color, color }}>{STATUS_LABELS[item.status]}</Badge>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                Coletado: <span className="font-mono">{item.collectedValue || 'Nao informado'}</span>
                                {item.expectedValue && <> | Esperado: <span className="font-mono">{item.expectedValue}</span></>}
                              </div>
                              {item.notes && <div className="text-xs text-muted-foreground mt-1 italic">{item.notes}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Sizing Tab */}
          {analysis.sizing && (
            <TabsContent value="sizing" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-primary" /> Comparativo de Dimensionamento
                  </CardTitle>
                  <CardDescription>
                    Perfil: {analysis.sizing.profile} | Status:{' '}
                    <Badge variant="outline" className={
                      analysis.sizing.sizingStatus === 'ADEQUADO' ? 'border-green-500 text-green-600' :
                      analysis.sizing.sizingStatus === 'SUBDIMENSIONADO' ? 'border-red-500 text-red-600' :
                      'border-amber-500 text-amber-600'
                    }>
                      {analysis.sizing.sizingStatus}
                    </Badge>
                    {(analysis.sizing as any).overLimit && (
                      <Badge variant="outline" className="ml-2 border-orange-500 text-orange-600">
                        Acima do limite padrao
                      </Badge>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={sizingData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="atual" name="Atual" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="recomendado" name="Recomendado" fill="#245C90" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="p-4 rounded-lg bg-muted/30">
                      <div className="text-sm text-muted-foreground mb-1">CPU</div>
                      <div className="text-lg font-semibold">Atual: {analysis.sizing.currentCpu}</div>
                      <div className="text-sm text-primary">Recomendado: {analysis.sizing.recommendedCpu}</div>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/30">
                      <div className="text-sm text-muted-foreground mb-1">Memoria RAM</div>
                      <div className="text-lg font-semibold">Atual: {analysis.sizing.currentRam}</div>
                      <div className="text-sm text-primary">Recomendado: {analysis.sizing.recommendedRam}</div>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/30">
                      <div className="text-sm text-muted-foreground mb-1">Disco</div>
                      <div className="text-lg font-semibold">Atual: {analysis.sizing.currentDisk}</div>
                      <div className="text-sm text-primary">Recomendado: {analysis.sizing.recommendedDisk}</div>
                    </div>
                  </div>
                  {((analysis.sizing as any).recommendedInstances || (analysis.sizing as any).recommendedHeap) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      {(analysis.sizing as any).recommendedInstances && (
                        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                          <div className="text-sm text-muted-foreground mb-1">Instancias Recomendadas</div>
                          <div className="text-sm font-medium text-primary">{(analysis.sizing as any).recommendedInstances}</div>
                        </div>
                      )}
                      {(analysis.sizing as any).recommendedHeap && (
                        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                          <div className="text-sm text-muted-foreground mb-1">Configuracao de Heap (host.xml)</div>
                          <div className="text-sm font-medium text-primary">{(analysis.sizing as any).recommendedHeap}</div>
                        </div>
                      )}
                    </div>
                  )}
                  {(analysis.sizing as any).overLimitNote && (
                    <div className="mt-4 p-4 rounded-lg bg-orange-50 border border-orange-200 dark:bg-orange-950/20 dark:border-orange-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-orange-700 dark:text-orange-300">{(analysis.sizing as any).overLimitNote}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Health Check Tab */}
          {analysis.healthCheck && (
            <TabsContent value="health" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" /> Metricas de Health Check
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {healthData.map((metric) => (
                      <div key={metric.name} className="p-4 rounded-lg bg-muted/30 text-center">
                        <div className="text-sm text-muted-foreground mb-2">{metric.name}</div>
                        <div className="text-2xl font-bold" style={{ color: metric.fill }}>{metric.value}%</div>
                        <Progress value={metric.value} className="mt-2" />
                      </div>
                    ))}
                  </div>
                  {analysis.healthCheck.aiInterpretation && (
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="font-medium">Interpretacao da IA</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{analysis.healthCheck.aiInterpretation}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Executive Summary Tab */}
          <TabsContent value="executive" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" /> Resumo Executivo com IA
                    </CardTitle>
                    <CardDescription>Analise consolidada do ambiente gerada por inteligencia artificial.</CardDescription>
                  </div>
                  <Button onClick={handleGenerateSummary} disabled={generatingSummary}>
                    {generatingSummary ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando...</> : <><Sparkles className="h-4 w-4 mr-2" /> Gerar Resumo</>}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {analysis.executiveSummary ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-muted/30">
                      <h4 className="font-semibold mb-2">Resumo</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">{analysis.executiveSummary}</p>
                    </div>
                    {analysis.recommendations && analysis.recommendations.length > 0 && (
                      <div className="p-4 rounded-lg bg-muted/30">
                        <h4 className="font-semibold mb-2">Recomendacoes</h4>
                        <ul className="space-y-2">
                          {analysis.recommendations.map((rec, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Clique em &quot;Gerar Resumo&quot; para criar uma analise executiva com IA.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
