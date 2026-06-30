'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Loader2, Plus, Server, Gauge, AlertTriangle, Calendar, ChevronRight } from 'lucide-react';
import NavBar from '@/components/NavBar';
import { getCurrentUser } from '@/lib/supabase-client';
import { fetchEnvironmentAnalyses } from '@/lib/environment-service';

export default function EnvironmentHistoryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
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

  if (!isAuthenticated || isLoading) {
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main>;
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-secondary/10 text-foreground">
      <NavBar />
      <div className="max-w-5xl mx-auto pt-24 px-6 md:px-10 pb-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Historico de Analises de Ambiente</h1>
            <p className="text-muted-foreground">{total} analise(s) realizada(s)</p>
          </div>
          <Button onClick={() => router.push('/environment/new')}>
            <Plus className="h-4 w-4 mr-2" /> Nova Analise
          </Button>
        </div>

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
              {analyses.map((a) => (
                <Card key={a.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/environment/${a.id}`)}>
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Server className="h-6 w-6 text-primary" />
                      </div>
                      <div>
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
                    <div className="flex items-center gap-3">
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
      </div>
    </main>
  );
}
