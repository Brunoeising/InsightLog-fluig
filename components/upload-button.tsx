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
import { getErrorCategoryFromMessage } from '@/lib/log-categorizer';


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
      const analysis = await analyzeLogContent(fileContent, user.id);
  
      // Buscar categorias personalizadas e padrão
      const { data: userCategories, error: userError } = await supabase
        .from('error_categories')
        .select('id, name, terms')
        .eq('user_id', user.id);
  
      if (userError) throw new Error('Erro ao buscar categorias do usuário: ' + userError.message);
  
      const { data: defaultCategories, error: defaultError } = await supabase
        .from('default_error_categories')
        .select('id, name, terms');
  
      if (defaultError) throw new Error('Erro ao buscar categorias padrão: ' + defaultError.message);
  
      // Criar mapeamento de categorias
      const allCategories = [...(userCategories || []), ...(defaultCategories || [])];
      const categoryNameMap: Record<string, string> = {};
      for (const cat of allCategories) {
        categoryNameMap[cat.name.toUpperCase()] = cat.name;
      }
  
      if (analysis.hasMoreErrors || analysis.hasMoreWarnings) {
        toast({
          title: "🟡Aviso de processamento",
          description: "Devido ao grande volume de informações, a exibição dos dados pode levar alguns instantes.",
          duration: 6000,
        });
      }
  
      simulateProgress(40, 60, 2000);
      const aiAnalysis = await analyzeLogErrors({
        logContent: fileContent,
        errorEntries: analysis.errorEntries,
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
          ls_enabled: analysis.systemInfo?.ls_enabled,
        })
        .select()
        .single();
  
      if (analysisError) throw analysisError;
  
      simulateProgress(90, 95, 1000);
  
      const logEntries: any[] = [];
  
      for (let i = 0; i < analysis.errorEntries.length; i++) {
        const error = analysis.errorEntries[i];
        const suggestion = aiAnalysis.errorAnalysis[i]?.suggestion;
        const category = await getErrorCategoryFromMessage(error.message, user.id);
  
        logEntries.push({
          analysis_id: analysisData.id,
          level: 'ERROR',
          message: error.message,
          timestamp: error.timestamp,
          category: category ? categoryNameMap[category.name.toUpperCase()] || category.name : 'OTHER',
          context_before: error.contextBefore,
          context_after: error.contextAfter,
          suggestion,
        });
      }
  
      for (const warning of analysis.warningEntries) {
        logEntries.push({
          analysis_id: analysisData.id,
          level: 'WARN',
          message: warning.message,
          timestamp: warning.timestamp,
          category: 'OTHER',
          category_id: null,
          context_before: [],
          context_after: [],
        });
      }
  
      if (logEntries.length > 0) {
        const { error: entriesError } = await supabase
          .from('log_entries')
          .insert(logEntries);
  
        if (entriesError) throw entriesError;
      }
  
      if (analysis.performanceIssues.length > 0) {
        const { error: performanceError } = await supabase
          .from('log_performance_issues')
          .insert(
            analysis.performanceIssues.map((issue) => ({
              analysis_id: analysisData.id,
              type: issue.type,
              message: issue.message,
              timestamp: issue.timestamp,
              duration: issue.duration,
              context: issue.context,
              suggestion: issue.suggestion,
            }))
          );
  
        if (performanceError) throw performanceError;
      }
  
      simulateProgress(95, 100, 500);
  
      const currentAnalysis = {
        ...analysisData,
        errors: analysis.errorEntries.map((error, index) => ({
          ...error,
          suggestion: aiAnalysis.errorAnalysis[index]?.suggestion,
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
        systemInfo: analysis.systemInfo,
        categories: allCategories, // Incluir categorias no currentAnalysis
        categoryNameMap, // Incluir mapeamento de nomes
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
          systemInfo: analysis.systemInfo,
          categories: allCategories,
          categoryNameMap,
        };
        localStorage.setItem('currentAnalysis', JSON.stringify(minimalAnalysis));
      }
  
      await new Promise((resolve) => setTimeout(resolve, 500));
  
      router.push(`/analysis/${analysisData.id}`);
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
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".log"
        className="hidden"
      />

      {!isUploading ? (
        <button
          onClick={handleUploadClick}
          type="button"
          className="w-full group relative border-2 border-dashed border-border hover:border-primary/40 rounded-xl p-8 transition-all duration-200 hover:bg-primary/[0.02] cursor-pointer"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Enviar arquivo de log</p>
              <p className="text-xs text-muted-foreground mt-1">Arraste ou clique para selecionar (.log, ate 50MB)</p>
            </div>
          </div>
        </button>
      ) : (
        <div className="w-full p-6 border rounded-xl bg-card space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground">{(fileSize / (1024 * 1024)).toFixed(1)} MB</p>
            </div>
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
          <div className="space-y-1.5">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-muted-foreground text-center">Processando... {Math.round(progress)}%</p>
          </div>
        </div>
      )}
    </div>
  );
}