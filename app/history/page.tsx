'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, FileText, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { LogAnalysisResult, LogErrorEntry } from '@/lib/types';
import { supabase } from '@/lib/supabase-client';
import { useToast } from '@/hooks/use-toast';
import { ErrorDetails } from '@/components/error-details';
import { SystemInfo } from '@/components/system-info';
import { BarChart2, Zap, Shield, Settings } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserNav } from '@/components/user-nav';

export default function HistoryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [analyses, setAnalyses] = useState<LogAnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalyses() {
      try {
        const { data: analysesData, error: analysesError } = await supabase
          .from('log_analyses')
          .select(`
            id,
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
            ls_enabled
          `)
          .order('uploaded_at', { ascending: false });

        if (analysesError) throw analysesError;

        // Initialize analyses with empty arrays and system info
        setAnalyses((analysesData || []).map(item => ({
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
            ls_enabled: item.ls_enabled
          }
        })));
      } catch (error) {
        toast({
          title: "Erro ao carregar histórico",
          description: "Não foi possível carregar o histórico de análises.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchAnalyses();
  }, [toast]);

  const handleAnalysisSelect = async (analysis: LogAnalysisResult) => {
    setLoadingAnalysis(analysis.id || null);
    
    try {
      // Fetch errors with context
      const { data: entriesData, error: entriesError } = await supabase
        .from('log_entries')
        .select(`
          id,
          level,
          message,
          timestamp,
          category,
          context_before,
          context_after,
          suggestion
        `)
        .eq('analysis_id', analysis.id);

      if (entriesError) throw entriesError;

      // Fetch performance issues
      const { data: performanceData, error: performanceError } = await supabase
        .from('log_performance_issues')
        .select('*')
        .eq('analysis_id', analysis.id);

      if (performanceError) throw performanceError;

      // Separate errors and warnings
      const errors = entriesData
        ?.filter(entry => entry.level === 'ERROR')
        .map(error => ({
          ...error,
          contextBefore: error.context_before || [],
          contextAfter: error.context_after || []
        })) || [];

      const warnings = entriesData
        ?.filter(entry => entry.level === 'WARN')
        .map(warning => ({
          level: warning.level,
          message: warning.message,
          timestamp: warning.timestamp
        })) || [];

      const completeAnalysis = {
        ...analysis,
        errors,
        warnings,
        performanceIssues: performanceData || []
      };

      localStorage.setItem('currentAnalysis', JSON.stringify(completeAnalysis));
      router.push('/analysis');
    } catch (error) {
      toast({
        title: "Erro ao carregar análise",
        description: "Não foi possível carregar os detalhes da análise.",
        variant: "destructive",
      });
    } finally {
      setLoadingAnalysis(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
  <header className="fixed top-0 left-0 right-0 bg-background/80 backdrop-blur-sm z-50 border-b px-6 md:px-10">
  <div className="flex w-full h-16 items-center justify-between">
    {/* Esquerda: Logo */}
    <div className="flex items-center gap-2">
      <Zap className="h-6 w-6 text-primary" />
      <span className="text-xl font-bold">InsightLog</span>
    </div>

    {/* Direita: Botões */}
    <div className="flex items-center gap-4">
      <Link href="/history">
        <Button variant="ghost">Histórico</Button>
      </Link>
      <Link href="/settings">
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </Link>
      <ThemeToggle />
      <UserNav />
    </div>
  </div>
</header>


      <div className="max-w-7xl mt-12 mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => router.push('/')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Histórico de Análises</h1>
        </div>
        
        {analyses.length === 0 ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center">
              <FileText className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
              <h2 className="text-xl font-medium mb-2">Nenhum histórico de análise</h2>
              <p className="text-muted-foreground mb-6">
                Você ainda não analisou nenhum arquivo de log.
              </p>
              <Button onClick={() => router.push('/')}>
                Fazer Upload de Log
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {analyses.map((analysis) => (
              <Card 
                key={analysis.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => handleAnalysisSelect(analysis)}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <h3 className="font-medium">{analysis.fileName}</h3>
                        </div>
                        
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {analysis.summary}
                        </p>
                      </div>
                      
                      <div className="flex flex-col md:items-end gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 text-destructive" />
                            {analysis.errorCount} Erros
                          </Badge>
                          
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(analysis.uploadedAt).toLocaleDateString()}
                          </Badge>
                        </div>
                        
                        <Button 
                          size="sm" 
                          variant="ghost"
                          disabled={loadingAnalysis === analysis.id}
                          className="gap-2"
                        >
                          {loadingAnalysis === analysis.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Carregando...
                            </>
                          ) : (
                            'Ver Análise'
                          )}
                        </Button>
                      </div>
                    </div>

                    <SystemInfo systemInfo={analysis.systemInfo || {}} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}