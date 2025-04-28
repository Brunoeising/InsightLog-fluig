'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, FileText, AlertCircle, Clock } from 'lucide-react';
import { LogAnalysisResult, LogErrorEntry } from '@/lib/types';
import { supabase } from '@/lib/supabase-client';
import { useToast } from '@/hooks/use-toast';
import { ErrorDetails } from '@/components/error-details';

export default function HistoryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [analyses, setAnalyses] = useState<LogAnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
            suggestions
          `)
          .order('uploaded_at', { ascending: false });

        if (analysesError) throw analysesError;

        // Initialize analyses with empty arrays for errors and warnings
        setAnalyses((analysesData || []).map(item => ({
          ...item,
          errors: [],
          warnings: []
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
        warnings
      };

      localStorage.setItem('currentAnalysis', JSON.stringify(completeAnalysis));
      router.push('/analysis');
    } catch (error) {
      toast({
        title: "Erro ao carregar análise",
        description: "Não foi possível carregar os detalhes da análise.",
        variant: "destructive",
      });
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
      <div className="max-w-7xl mx-auto">
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
          <div className="space-y-4">
            {analyses.map((analysis) => (
              <Card 
                key={analysis.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => handleAnalysisSelect(analysis)}
              >
                <CardContent className="p-6">
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
                      
                      <Button size="sm" variant="ghost">
                        Ver Análise
                      </Button>
                    </div>
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