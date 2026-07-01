"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { supabase, getCurrentUser } from '@/lib/supabase-client';
import { ChunkedLogBatch, ChunkedLogSummary } from '@/lib/log-parser-chunked';
import { ErrorCategoryDefinition } from '@/lib/log-categorizer';

const LOCAL_ANALYSIS_LIMIT = 1024 * 1024 * 1024;

function formatFileSize(size: number) {
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getProcessingErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes('Failed to fetch')) {
      return 'Não foi possível comunicar com o servidor. Verifique sua conexão e tente novamente.';
    }

    if (error.message.includes('504') || error.message.toLowerCase().includes('timeout')) {
      return 'O processamento demorou mais que o limite da plataforma. Tente novamente ou divida o log em um arquivo menor enquanto o processamento assíncrono não é implementado.';
    }

    return error.message;
  }

  return 'Ocorreu um erro ao processar seu arquivo. Por favor, tente novamente.';
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json')
    ? response.json()
    : { error: await response.text() };
}

async function fetchWithJson<T>(url: string, token: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(result.error || `Falha na requisição (${response.status}).`);
  }
  return result as T;
}

export function UploadButton() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const workerRef = useRef<Worker | null>(null);
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
      workerRef.current?.terminate();
    };
  }, [router]);

  const handleUploadClick = () => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    fileInputRef.current?.click();
  };

  const persistBatch = async (token: string, analysisId: string, batch: ChunkedLogBatch) => {
    await fetchWithJson('/api/logs/analyze/batch', token, {
      analysisId,
      batchNumber: batch.batchNumber,
      errors: batch.errors,
      warnings: batch.warnings,
      performanceIssues: batch.performanceIssues,
      totalEntries: batch.totalEntries,
      totalErrors: batch.totalErrors,
      totalWarnings: batch.totalWarnings,
      totalPerformanceIssues: batch.totalPerformanceIssues,
    });
  };

  const analyzeFileLocally = async (file: File, token: string) => {
    setStatusMessage('Criando análise local...');
    setProgress(2);

    const { analysisId } = await fetchWithJson<{ analysisId: string }>('/api/logs/analyze/create', token, {
      fileName: file.name,
      fileSize: file.size,
    });

    const { categories } = await fetchWithJson<{ categories: ErrorCategoryDefinition[] }>('/api/logs/categories', token, undefined, 'GET');

    setStatusMessage('Lendo arquivo localmente...');
    setProgress(5);

    await new Promise<void>((resolve, reject) => {
      const worker = new Worker(new URL('../workers/log-parser.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      let pendingBatch = Promise.resolve();

      worker.onmessage = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'PROGRESS') {
          setProgress(Math.min(85, 5 + Math.round(message.percent * 0.75)));
          setStatusMessage(`Lendo arquivo localmente... ${message.percent}%`);
          return;
        }

        if (message.type === 'BATCH_READY') {
          const batch = message.batch as ChunkedLogBatch;
          pendingBatch = pendingBatch.then(async () => {
            setStatusMessage(`Persistindo lote ${batch.batchNumber}...`);
            await persistBatch(token, analysisId, batch);
          });
          return;
        }

        if (message.type === 'COMPLETE') {
          const summary = message.summary as ChunkedLogSummary;
          pendingBatch
            .then(async () => {
              setStatusMessage('Finalizando análise local...');
              setProgress(92);
              await fetchWithJson('/api/logs/analyze/finalize', token, {
                analysisId,
                ...summary,
              });
              setProgress(100);
              resolve();
            })
            .catch(reject);
          return;
        }

        if (message.type === 'ERROR') {
          reject(new Error(message.error));
        }
      };

      worker.onerror = (event) => {
        reject(new Error(event.message || 'Falha no worker de leitura do log.'));
      };

      worker.postMessage({ type: 'PARSE_FILE', file, categories });
    });

    workerRef.current?.terminate();
    workerRef.current = null;

    toast({
      title: 'Análise local concluída',
      description: 'O arquivo foi lido integralmente e os diagnósticos foram persistidos.',
      duration: 6000,
    });

    router.push(`/analysis/${analysisId}`);
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
  
    if (file.size > LOCAL_ANALYSIS_LIMIT) {
      toast({
        title: "Arquivo muito grande",
        description: "O tamanho máximo para análise local é 1GB.",
        variant: "destructive",
      });
      return;
    }
  
    setFileName(file.name);
    setFileSize(file.size);
    setIsUploading(true);
    setProgress(0);
    setStatusMessage('Preparando análise local...');
  
    try {
      const user = await getCurrentUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        router.push('/auth/login');
        return;
      }

      await analyzeFileLocally(file, session.access_token);
      setIsUploading(false);
      setProgress(0);
      setStatusMessage('');
    } catch (error: any) {
      console.error('Upload error:', error);
      setIsUploading(false);
      setProgress(0);
      setStatusMessage('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
  
      toast({
        title: "Falha no upload",
        description: getProcessingErrorMessage(error),
        variant: "destructive",
      });
    }
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
              <p className="text-xs text-muted-foreground mt-1">Arquivos .log até 1GB com análise local</p>
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
              <p className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</p>
            </div>
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
          <div className="space-y-1.5">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-muted-foreground text-center">{statusMessage || 'Processando...'} {Math.round(progress)}%</p>
            {progress >= 40 && progress < 90 && (
              <p className="text-[11px] text-muted-foreground text-center">
                Logs grandes são lidos localmente; somente diagnósticos são enviados ao servidor.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}