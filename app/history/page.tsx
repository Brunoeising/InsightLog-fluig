'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ChevronLeft,
  FileText,
  AlertCircle,
  Clock,
  Loader2,
  BarChart2,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
} from 'lucide-react';
import { LogAnalysisResult } from '@/lib/types';
import { supabase } from '@/lib/supabase-client';
import { useToast } from '@/hooks/use-toast';
import { SystemInfo } from '@/components/system-info';
import NavBar from '@/components/NavBar';

const PAGE_SIZE_OPTIONS = [5, 10, 50, 100];

export default function HistoryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [analyses, setAnalyses] = useState<LogAnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState<string | null>(null);
  const [deletingAnalysis, setDeletingAnalysis] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalAnalyses, setTotalAnalyses] = useState(0);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => {
    fetchAnalyses();
  }, [currentPage, pageSize]);

  async function fetchAnalyses() {
    setIsLoading(true);
    try {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data: analysesData, error: analysesError, count } = await supabase
        .from('log_analyses')
        .select(
          `id,
          fileName:file_name,
          uploadedAt:uploaded_at,
          errorCount:error_count,
          warningCount:warning_count,
          summary,
          suggestions,
          fluig_version,
          os_name,
          server_type,
          database_name,
          database_version,
          server_url,
          java_version,
          solr_enabled,
          ls_enabled`,
          { count: 'exact' }
        )
        .order('uploaded_at', { ascending: false })
        .range(from, to);

      if (analysesError) throw analysesError;

      setTotalAnalyses(count || 0);
      setAnalyses(
        (analysesData || []).map(item => ({
          ...item,
          errors: [],
          warnings: [],
          performanceIssues: [],
          systemInfo: {
            fluig_version: item.fluig_version,
            os_name: item.os_name,
            server_type: item.server_type,
            database_name: item.database_name,
            database_version: item.database_version,
            server_url: item.server_url,
            java_version: item.java_version,
            solr_enabled: item.solr_enabled,
            ls_enabled: item.ls_enabled,
          },
        }))
      );
    } catch {
      toast({
        title: 'Erro ao carregar histórico',
        description: 'Não foi possível carregar o histórico de análises.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleAnalysisSelect = async (analysis: LogAnalysisResult) => {
    setLoadingAnalysis(analysis.id || null);

    try {
      const [{ data: entriesData, error: entriesError }, { data: performanceData, error: performanceError }] =
        await Promise.all([
          supabase
            .from('log_entries')
            .select('id, level, message, timestamp, category, context_before, context_after, suggestion, caused_by')
            .eq('analysis_id', analysis.id),
          supabase.from('log_performance_issues').select('*').eq('analysis_id', analysis.id),
        ]);

      if (entriesError) throw entriesError;
      if (performanceError) throw performanceError;

      const errors =
        entriesData
          ?.filter(entry => entry.level === 'ERROR')
          .map(error => ({
            ...error,
            contextBefore: error.context_before || [],
            contextAfter: error.context_after || [],
            causedBy: error.caused_by || [],
          })) || [];

      const warnings =
        entriesData
          ?.filter(entry => entry.level === 'WARN')
          .map(warning => ({
            level: warning.level,
            message: warning.message,
            timestamp: warning.timestamp,
          })) || [];

      const completeAnalysis = {
        ...analysis,
        errors,
        warnings,
        performanceIssues: performanceData || [],
      };

      localStorage.setItem('currentAnalysis', JSON.stringify(completeAnalysis));
      router.push(`/analysis/${analysis.id}`);
    } catch {
      toast({
        title: 'Erro ao carregar análise',
        description: 'Não foi possível carregar os detalhes da análise.',
        variant: 'destructive',
      });
    } finally {
      setLoadingAnalysis(null);
    }
  };

  const handleDeleteAnalysis = async (analysisId: string) => {
    setDeletingAnalysis(analysisId);

    try {
      const { error } = await supabase.from('log_analyses').delete().eq('id', analysisId);

      if (error) throw error;

      setAnalyses(prev => prev.filter(a => a.id !== analysisId));
      setTotalAnalyses(prev => prev - 1);

      // Clean up localStorage if it was the current analysis
      try {
        const stored = localStorage.getItem('currentAnalysis');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.id === analysisId) localStorage.removeItem('currentAnalysis');
        }
      } catch {
        // ignore localStorage errors
      }

      toast({ title: 'Análise excluída com sucesso.' });

      // Go back a page if this was the last item on the page
      if (analyses.length === 1 && currentPage > 1) {
        setCurrentPage(p => p - 1);
      }
    } catch {
      toast({
        title: 'Erro ao excluir análise',
        description: 'Não foi possível excluir a análise. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setDeletingAnalysis(null);
    }
  };

  const totalPages = Math.ceil(totalAnalyses / pageSize);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <NavBar />

      <div className="max-w-7xl text-muted-foreground mt-14 mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl text-muted-foreground font-bold">Histórico de Análises</h1>
        </div>

        {analyses.length === 0 ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center">
              <FileText className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
              <h2 className="text-xl font-medium mb-2">Nenhum histórico de análise</h2>
              <p className="text-muted-foreground mb-6">Você ainda não analisou nenhum arquivo de log.</p>
              <Button onClick={() => router.push('/')}>Fazer Upload de Log</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-6">
              {analyses.map(analysis => (
                <Card
                  key={analysis.id}
                  className="transition-all hover:shadow-md hover:border-[#245C90]/30 group"
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div
                          className="space-y-2.5 cursor-pointer flex-1"
                          onClick={() => handleAnalysisSelect(analysis)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors">
                              <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-medium text-foreground">{analysis.fileName}</h3>
                              <p className="text-sm text-muted-foreground">
                                {new Date(analysis.uploadedAt).toLocaleString('pt-BR', {
                                  day: '2-digit',
                                  month: 'long',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col md:items-end gap-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive" className="gap-1.5 px-2.5 py-1">
                              <AlertCircle className="h-3.5 w-3.5" />
                              {analysis.errorCount} Erro{analysis.errorCount !== 1 ? 's' : ''}
                            </Badge>
                            <Badge variant="secondary" className="gap-1.5 px-2.5 py-1">
                              <Clock className="h-3.5 w-3.5" />
                              {analysis.warningCount} Alerta{analysis.warningCount !== 1 ? 's' : ''}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={loadingAnalysis === analysis.id}
                              className="gap-2"
                              onClick={() => handleAnalysisSelect(analysis)}
                            >
                              {loadingAnalysis === analysis.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Carregando...
                                </>
                              ) : (
                                <>
                                  <BarChart2 className="h-4 w-4" />
                                  Ver Detalhes
                                </>
                              )}
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  disabled={deletingAnalysis === analysis.id}
                                >
                                  {deletingAnalysis === analysis.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir análise</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir a análise de{' '}
                                    <strong>{analysis.fileName}</strong>? Todos os erros,
                                    alertas e dados de performance serão removidos permanentemente.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteAnalysis(analysis.id!)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </div>

                      <SystemInfo systemInfo={analysis.systemInfo || {}} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 border-t pt-4">
                <div className="flex items-center gap-2">
                  <Select
                    value={pageSize.toString()}
                    onValueChange={value => {
                      setPageSize(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Registros por página" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map(size => (
                        <SelectItem key={size} value={size.toString()}>
                          {size} registros por página
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <span className="text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
