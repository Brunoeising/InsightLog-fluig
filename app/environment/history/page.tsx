'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Loader2, Plus, Server, Gauge, AlertTriangle, Calendar, ChevronRight, GitCompareArrows, Search, ShieldAlert } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { getCurrentUser } from '@/lib/supabase-client';
import { compareEnvironmentAnalyses, fetchEnvironmentAnalyses } from '@/lib/environment-service';
import { EnvironmentComparison } from '@/lib/types';

const sizingOptions = [
  { value: 'all', label: 'Todos os dimensionamentos' },
  { value: 'ADEQUADO', label: 'Adequado' },
  { value: 'SUBDIMENSIONADO', label: 'Subdimensionado' },
  { value: 'SUPERDIMENSIONADO', label: 'Superdimensionado' },
];

export default function EnvironmentHistoryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sizingFilter, setSizingFilter] = useState('all');
  const [minScore, setMinScore] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<EnvironmentComparison | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const pageSize = 10;

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser();
      if (!user) { router.push('/auth/login'); return; }
      setIsAuthenticated(true);
    };
    checkAuth();
  }, [router]);

  const loadAnalyses = useCallback(async () => {
    setIsLoading(true);
    try {
      const { analyses: data, total: count } = await fetchEnvironmentAnalyses(page, pageSize);
      setAnalyses(data);
      setTotal(count);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [page, toast]);

  useEffect(() => { if (isAuthenticated) loadAnalyses(); }, [isAuthenticated, loadAnalyses]);

  const totalPages = Math.ceil(total / pageSize);
  const filteredAnalyses = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const minimumScore = minScore ? Number(minScore) : null;

    return analyses.filter((analysis) => {
      const matchesSearch = !normalizedSearch || analysis.environment_name.toLowerCase().includes(normalizedSearch);
      const matchesSizing = sizingFilter === 'all' || analysis.sizing_status === sizingFilter;
      const matchesScore = minimumScore === null || Number(analysis.compatibility_score || 0) >= minimumScore;
      return matchesSearch && matchesSizing && matchesScore;
    });
  }, [analyses, search, sizingFilter, minScore]);

  const summary = useMemo(() => {
    const averageScore = analyses.length
      ? Math.round(analyses.reduce((sum, analysis) => sum + Number(analysis.compatibility_score || 0), 0) / analyses.length)
      : 0;
    return {
      averageScore,
      riskCount: analyses.reduce((sum, analysis) => sum + Number(analysis.risk_count || 0), 0),
      nonHomologatedCount: analyses.reduce((sum, analysis) => sum + Number(analysis.non_homologated_count || 0), 0),
      subdimensionedCount: analyses.filter((analysis) => analysis.sizing_status === 'SUBDIMENSIONADO').length,
    };
  }, [analyses]);

  const toggleSelected = useCallback((analysisId: string) => {
    setSelectedIds((current) => {
      if (current.includes(analysisId)) return current.filter((id) => id !== analysisId);
      return [...current.slice(-1), analysisId];
    });
  }, []);

  const handleCompare = useCallback(async () => {
    if (selectedIds.length !== 2) return;
    setIsComparing(true);
    try {
      const result = await compareEnvironmentAnalyses(selectedIds[0], selectedIds[1]);
      setComparison(result);
    } catch (err: any) {
      toast({ title: 'Erro ao comparar', description: err.message, variant: 'destructive' });
    } finally {
      setIsComparing(false);
    }
  }, [selectedIds, toast]);

  if (!isAuthenticated || isLoading) {
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main>;
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto pb-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Historico de Analises de Ambiente</h1>
            <p className="text-muted-foreground">{total} analise(s) realizada(s)</p>
          </div>
          <Button onClick={() => router.push('/environment/new')}>
            <Plus className="h-4 w-4 mr-2" /> Nova Analise
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card><CardContent className="py-4"><p className="text-sm text-muted-foreground">Analises</p><p className="text-2xl font-bold">{total}</p></CardContent></Card>
          <Card><CardContent className="py-4"><p className="text-sm text-muted-foreground">Score medio</p><p className="text-2xl font-bold">{summary.averageScore}%</p></CardContent></Card>
          <Card><CardContent className="py-4"><p className="text-sm text-muted-foreground">Riscos na pagina</p><p className="text-2xl font-bold text-amber-600">{summary.riskCount}</p></CardContent></Card>
          <Card><CardContent className="py-4"><p className="text-sm text-muted-foreground">Subdimensionados</p><p className="text-2xl font-bold text-red-600">{summary.subdimensionedCount}</p></CardContent></Card>
        </div>

        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_150px_auto] gap-3 items-end">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ambiente" className="pl-9" />
              </div>
              <Select value={sizingFilter} onValueChange={setSizingFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sizingOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="Score minimo" min={0} max={100} />
              <Button variant="outline" onClick={handleCompare} disabled={selectedIds.length !== 2 || isComparing}>
                {isComparing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <GitCompareArrows className="h-4 w-4 mr-2" />}
                Comparar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Selecione duas analises para comparar inventario, portabilidade, dimensionamento e health check.</p>
          </CardContent>
        </Card>

        {analyses.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">Nenhuma analise de ambiente realizada ainda.</p>
              <Button onClick={() => router.push('/environment/new')}>
                <Plus className="h-4 w-4 mr-2" /> Criar primeira analise
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {filteredAnalyses.map((a) => (
                <Card key={a.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Checkbox
                        checked={selectedIds.includes(a.id)}
                        onCheckedChange={() => toggleSelected(a.id)}
                        aria-label={`Selecionar ${a.environment_name} para comparacao`}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Server className="h-6 w-6 text-primary" />
                      </div>
                      <div className="cursor-pointer" onClick={() => router.push(`/environment/${a.id}`)}>
                        <h3 className="font-semibold">{a.environment_name}</h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(a.created_at).toLocaleDateString('pt-BR')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Gauge className="h-3 w-3" />
                            {a.compatibility_score}%
                          </span>
                          {a.risk_count > 0 && (
                            <span className="flex items-center gap-1 text-amber-600">
                              <AlertTriangle className="h-3 w-3" />
                              {a.risk_count} risco(s)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push(`/environment/${a.id}`)}>
                      {a.sizing_status && (
                        <Badge variant="outline" className={
                          a.sizing_status === 'ADEQUADO' ? 'border-green-500 text-green-600' :
                          a.sizing_status === 'SUBDIMENSIONADO' ? 'border-red-500 text-red-600' :
                          'border-amber-500 text-amber-600'
                        }>
                          {a.sizing_status}
                        </Badge>
                      )}
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredAnalyses.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Nenhuma analise encontrada com os filtros atuais.
                </CardContent>
              </Card>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">Pagina {page} de {totalPages}</span>
                <Button variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}

        <Dialog open={Boolean(comparison)} onOpenChange={(open) => !open && setComparison(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Comparacao entre analises</DialogTitle>
              <DialogDescription>
                Delta de score: {(comparison?.scoreDelta ?? 0) > 0 ? '+' : ''}{comparison?.scoreDelta ?? 0} ponto(s) | Delta de riscos: {(comparison?.riskDelta ?? 0) > 0 ? '+' : ''}{comparison?.riskDelta ?? 0}
              </DialogDescription>
            </DialogHeader>
            {comparison && (
              <div className="space-y-3">
                {comparison.changes.length === 0 ? (
                  <div className="rounded-lg border p-6 text-center text-muted-foreground">Nenhuma diferenca relevante encontrada.</div>
                ) : comparison.changes.slice(0, 80).map((change, index) => (
                  <div key={`${change.category}-${change.field}-${index}`} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="font-medium">{change.label}</p>
                      <Badge variant="outline" className={
                        change.impact === 'positive' ? 'border-green-500 text-green-600' :
                        change.impact === 'negative' ? 'border-red-500 text-red-600' :
                        'border-muted-foreground/40 text-muted-foreground'
                      }>{change.category}</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="rounded bg-muted/50 p-2"><span className="text-muted-foreground">Anterior:</span> {change.previousValue}</div>
                      <div className="rounded bg-muted/50 p-2"><span className="text-muted-foreground">Atual:</span> {change.currentValue}</div>
                    </div>
                  </div>
                ))}
                {comparison.changes.length > 80 && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300">
                    <ShieldAlert className="h-4 w-4" /> Exibindo as primeiras 80 diferencas de {comparison.changes.length}.
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
