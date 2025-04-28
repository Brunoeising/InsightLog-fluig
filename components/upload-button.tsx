"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Loader2, AlertTriangle } from 'lucide-react';
import { analyzeLogContent } from '@/lib/log-parser';
import { Card, CardContent } from '@/components/ui/card';
import { supabase, getCurrentUser, uploadLogFile } from '@/lib/supabase-client';
import { analyzeLogErrors } from '@/lib/openai-service';

export function UploadButton() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout>();
  const [fileSize, setFileSize] = useState<number>(0);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await getCurrentUser();
        setIsAuthenticated(!!user);
        
        if (!user) {
          router.push('/auth/login');
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
        router.push('/auth/login');
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session?.user);
      if (!session?.user) {
        router.push('/auth/login');
      }
    });

    return () => {
      subscription.unsubscribe();
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [router]);

  const handleUploadClick = () => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    fileInputRef.current?.click();
  };

  const simulateProgress = (currentProgress: number, targetProgress: number, duration: number) => {
    const step = (targetProgress - currentProgress) / (duration / 100);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    progressIntervalRef.current = setInterval(() => {
      setProgress(prev => {
        const next = Math.min(prev + step, targetProgress);
        if (next >= targetProgress) {
          clearInterval(progressIntervalRef.current);
        }
        return next;
      });
    }, 100);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.log')) {
      toast({
        title: "Formato de arquivo inválido",
        description: "Por favor, faça upload de um arquivo .log",
        variant: "destructive",
      });
      return;
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "Arquivo muito grande",
        description: "O tamanho máximo do arquivo é 50MB",
        variant: "destructive",
      });
      return;
    }

    setFileName(file.name);
    setFileSize(file.size);
    setIsUploading(true);
    setProgress(0);

    try {
      const user = await getCurrentUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }

      simulateProgress(0, 20, 1000);
      const fileContent = await readFileAsText(file);

      simulateProgress(20, 40, 1500);
      const analysis = analyzeLogContent(fileContent);

      if (analysis.hasMoreErrors || analysis.hasMoreWarnings) {
        toast({
          title: "Aviso de processamento",
          description: "Devido ao tamanho do arquivo, apenas os primeiros 1000 erros e avisos serão exibidos inicialmente.",
          duration: 6000,
        });
      }

      simulateProgress(40, 60, 2000);
      const aiAnalysis = await analyzeLogErrors({
        logContent: fileContent,
        errorEntries: analysis.errorEntries
      });

      simulateProgress(60, 80, 2000);
      const { path, url } = await uploadLogFile(file, user.id);

      simulateProgress(80, 90, 1500);
      const { data: analysisData, error: analysisError } = await supabase
        .from('log_analyses')
        .insert({
          file_name: file.name,
          file_path: path,
          file_url: url,
          uploaded_at: new Date().toISOString(),
          error_count: analysis.errorCount,
          warning_count: analysis.warningCount,
          summary: aiAnalysis.summary,
          suggestions: aiAnalysis.suggestions,
          user_id: user.id,
          fluig_version: analysis.systemInfo?.fluig_version,
          os_name: analysis.systemInfo?.os_name,
          server_type: analysis.systemInfo?.server_type,
          database_name: analysis.systemInfo?.database_name,
          database_version: analysis.systemInfo?.database_version,
          server_url: analysis.systemInfo?.server_url,
          java_version: analysis.systemInfo?.java_version,
          solr_enabled: analysis.systemInfo?.solr_enabled,
          ls_enabled: analysis.systemInfo?.ls_enabled
        })
        .select()
        .single();

      if (analysisError) throw analysisError;

      simulateProgress(90, 95, 1000);
      
      const logEntries = [
        ...analysis.errorEntries.map((error, index) => ({
          analysis_id: analysisData.id,
          level: 'ERROR',
          message: error.message,
          timestamp: error.timestamp,
          category: error.category,
          context_before: error.contextBefore,
          context_after: error.contextAfter,
          suggestion: aiAnalysis.errorAnalysis[index]?.suggestion
        })),
        ...analysis.warningEntries.map(warning => ({
          analysis_id: analysisData.id,
          level: 'WARN',
          message: warning.message,
          timestamp: warning.timestamp,
          category: 'OTHER',
          context_before: [],
          context_after: []
        }))
      ];

      if (logEntries.length > 0) {
        const { error: entriesError } = await supabase
          .from('log_entries')
          .insert(logEntries);

        if (entriesError) throw entriesError;
      }

      if (analysis.performanceIssues.length > 0) {
        const { error: performanceError } = await supabase
          .from('log_performance_issues')
          .insert(analysis.performanceIssues.map(issue => ({
            analysis_id: analysisData.id,
            type: issue.type,
            message: issue.message,
            timestamp: issue.timestamp,
            duration: issue.duration,
            context: issue.context,
            suggestion: issue.suggestion
          })));

        if (performanceError) throw performanceError;
      }

      simulateProgress(95, 100, 500);

      const currentAnalysis = {
        ...analysisData,
        errors: analysis.errorEntries.map((error, index) => ({
          ...error,
          suggestion: aiAnalysis.errorAnalysis[index]?.suggestion
        })),
        warnings: analysis.warningEntries,
        performanceIssues: analysis.performanceIssues,
        fileName: analysisData.file_name,
        uploadedAt: analysisData.uploaded_at,
        errorCount: analysisData.error_count,
        warningCount: analysisData.warning_count,
        summary: aiAnalysis.summary,
        suggestions: aiAnalysis.suggestions,
        hasMoreErrors: analysis.hasMoreErrors,
        hasMoreWarnings: analysis.hasMoreWarnings,
        systemInfo: analysis.systemInfo
      };
      
      try {
        localStorage.setItem('currentAnalysis', JSON.stringify(currentAnalysis));
      } catch (storageError) {
        console.warn('Failed to store full analysis in localStorage, storing minimal version');
        const minimalAnalysis = {
          id: analysisData.id,
          fileName: analysisData.file_name,
          uploadedAt: analysisData.uploaded_at,
          errorCount: analysisData.error_count,
          warningCount: analysisData.warning_count,
          summary: aiAnalysis.summary,
          suggestions: aiAnalysis.suggestions,
          hasMoreErrors: analysis.hasMoreErrors,
          hasMoreWarnings: analysis.hasMoreWarnings,
          systemInfo: analysis.systemInfo
        };
        localStorage.setItem('currentAnalysis', JSON.stringify(minimalAnalysis));
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      
      router.push('/analysis');
      setIsUploading(false);
      setProgress(0);

    } catch (error: any) {
      console.error('Upload error:', error);
      setIsUploading(false);
      setProgress(0);
      
      toast({
        title: "Falha no upload",
        description: error.message || "Ocorreu um erro ao processar seu arquivo. Por favor, tente novamente.",
        variant: "destructive",
      });
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target?.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  };

  return (
    <div className="flex flex-col items-center w-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".log"
        className="hidden"
      />
      
      {!isUploading ? (
        <Button 
          onClick={handleUploadClick}
          size="lg" 
          className="mt-6 mb-4 px-8 text-lg gap-2"
        >
          <Upload className="h-5 w-5" />
          Fazer Upload de Log
        </Button>
      ) : (
        <div className="w-full max-w-md space-y-4 mt-6">
          <div className="flex items-center space-x-4">
            <FileText className="h-6 w-6 text-muted-foreground" />
            <div className="flex-1 space-y-1 overflow-hidden">
              <div className="flex items-center justify-between">
                <p className="text-sm truncate">{fileName}</p>
                <span className="text-xs text-muted-foreground">
                  {(fileSize / (1024 * 1024)).toFixed(1)}MB
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        </div>
      )}
      
      <div className="pt-4">
        <Card className="bg-secondary/50">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Suporta arquivos .log até 50MB. Seus logs são processados com segurança.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}