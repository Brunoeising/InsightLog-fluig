"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { analyzeLogContent } from '@/lib/log-parser';
import { Card, CardContent } from '@/components/ui/card';
import { supabase, getCurrentUser, uploadLogFile } from '@/lib/supabase-client';
import { analyzeLogErrors } from '@/lib/openai-service';
import { getErrorCategoryFromMessage } from '@/lib/log-categorizer';

const CHUNK_SIZE = 500;

async function insertInChunks(
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
  }
}

export function UploadButton() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [fileSize, setFileSize] = useState<number>(0);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await getCurrentUser();
        setIsAuthenticated(!!user);
        if (!user) router.push('/auth/login');
      } catch {
        setIsAuthenticated(false);
        router.push('/auth/login');
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
      if (!session?.user) router.push('/auth/login');
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const setStage = (pct: number, label: string) => {
    setProgress(pct);
    setStatusLabel(label);
  };

  const handleUploadClick = () => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.log')) {
      toast({
        title: 'Formato de arquivo inválido',
        description: 'Por favor, faça upload de um arquivo .log',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O tamanho máximo do arquivo é 50MB',
        variant: 'destructive',
      });
      return;
    }

    setFileName(file.name);
    setFileSize(file.size);
    setIsUploading(true);
    setStage(0, 'Iniciando...');

    try {
      const user = await getCurrentUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }

      // ── Stage 1: read file + fetch categories in parallel ─────────────────
      setStage(5, 'Lendo arquivo e carregando categorias...');
      const [rawContent, categoryCache] = await Promise.all([
        readFileAsText(file),
        getErrorCategoriesCache(user.id),
      ]);
      // eslint-disable-next-line no-control-regex
      const fileContent = rawContent.replace(/\x00/g, '');

      const allCategories = [...categoryCache.userCategories, ...categoryCache.defaultCategories];
      const categoryNameMap: Record<string, string> = {};
      for (const cat of allCategories) {
        categoryNameMap[cat.name.toUpperCase()] = cat.name;
      }

      // ── Stage 2: parse log (CPU-bound, synchronous) ────────────────────────
      setStage(20, 'Analisando estrutura do log...');
      const analysis = analyzeLogContent(fileContent, categoryCache);

      if (analysis.hasMoreErrors || analysis.hasMoreWarnings) {
        toast({
          title: 'Aviso de processamento',
          description: 'Devido ao grande volume de informações, a exibição pode levar alguns instantes.',
          duration: 6000,
        });
      }

      // ── Stage 3: AI analysis + storage upload in parallel ─────────────────
      setStage(35, 'Enviando para IA e fazendo upload do arquivo...');
      const [aiAnalysis, { path, url }] = await Promise.all([
        analyzeLogErrors({ logContent: fileContent, errorEntries: analysis.errorEntries }),
        uploadLogFile(file, user.id),
      ]);

      // ── Stage 4: create analysis record ───────────────────────────────────
      setStage(60, 'Salvando análise...');
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

      // ── Stage 5: build log entries ─────────────────────────────────────────
      const logEntries: Record<string, unknown>[] = [];

      for (let i = 0; i < analysis.errorEntries.length; i++) {
        const error = analysis.errorEntries[i];
        const suggestion = aiAnalysis.errorAnalysis[i]?.suggestion;
        const category = matchCategoryFromCache(error.message, categoryCache);

        logEntries.push({
          analysis_id: analysisData.id,
          level: 'ERROR',
          message: error.message,
          timestamp: error.timestamp,
          category: category
            ? categoryNameMap[category.name.toUpperCase()] || category.name
            : 'OTHER',
          context_before: error.contextBefore,
          context_after: error.contextAfter,
          caused_by: error.causedBy?.length ? error.causedBy : null,
          suggestion: suggestion ?? null,
        });
      }

      for (const warning of analysis.warningEntries) {
        logEntries.push({
          analysis_id: analysisData.id,
          level: 'WARN',
          message: warning.message,
          timestamp: warning.timestamp,
          category: 'OTHER',
          context_before: [],
          context_after: [],
        });
      }

      // ── Stage 6: chunked inserts ───────────────────────────────────────────
      const totalChunks = Math.ceil(logEntries.length / CHUNK_SIZE);
      for (let i = 0; i < logEntries.length; i += CHUNK_SIZE) {
        const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
        const pct = 65 + Math.round((chunkIndex / totalChunks) * 25);
        setStage(
          pct,
          `Salvando entradas ${Math.min(i + CHUNK_SIZE, logEntries.length)}/${logEntries.length}...`
        );
        const { error } = await supabase.from('log_entries').insert(logEntries.slice(i, i + CHUNK_SIZE));
        if (error) throw error;
      }

      if (analysis.performanceIssues.length > 0) {
        setStage(91, 'Salvando problemas de performance...');
        await insertInChunks(
          'log_performance_issues',
          analysis.performanceIssues.map(issue => ({
            analysis_id: analysisData.id,
            type: issue.type,
            message: issue.message,
            timestamp: issue.timestamp,
            duration: issue.duration ?? null,
            context: issue.context ?? null,
            suggestion: issue.suggestion ?? null,
          }))
        );
      }

      // ── Stage 7: save to localStorage and navigate ─────────────────────────
      setStage(97, 'Concluindo...');

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
        categories: allCategories,
        categoryNameMap,
      };

      try {
        localStorage.setItem('currentAnalysis', JSON.stringify(currentAnalysis));
      } catch {
        // localStorage quota exceeded — store minimal version so analysis page can load from DB
        localStorage.setItem('currentAnalysis', JSON.stringify({
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
        }));
      }

      setStage(100, 'Pronto!');
      router.push(`/analysis/${analysisData.id}`);
      setIsUploading(false);
      setProgress(0);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Ocorreu um erro ao processar seu arquivo.';
      console.error('Upload error:', error);
      setIsUploading(false);
      setProgress(0);
      setStatusLabel('');

      toast({
        title: 'Falha no upload',
        description: msg,
        variant: 'destructive',
      });
    }
  };

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });

  return (
    <div className="flex flex-col items-center w-full space-y-6">
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
          type="button"
          variant="outline"
          className="w-full h-auto bg-secondary text-foreground hover:opacity-70 transition rounded-md p-4 flex flex-col items-center"
        >
          <Upload className="h-5 w-5 mb-2" />
          <span className="text-lg font-medium">Fazer Upload de Log</span>
          <span className="text-sm text-muted-foreground mt-1">
            Arquivos .log de até 50MB são suportados. Seus dados são processados com total segurança.
          </span>
        </Button>
      ) : (
        <div className="w-full max-w-md space-y-4 mt-6">
          <div className="flex items-center space-x-4">
            <FileText className="h-6 w-6 text-muted-foreground shrink-0" />
            <div className="flex-1 space-y-1.5 overflow-hidden">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {(fileSize / (1024 * 1024)).toFixed(1)}MB
                </span>
              </div>
              <Progress value={progress} className="h-2 bg-primary/20" />
              <p className="text-xs text-muted-foreground">{statusLabel}</p>
            </div>
            <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}
