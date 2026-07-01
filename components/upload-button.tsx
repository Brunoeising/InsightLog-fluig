"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { supabase, getCurrentUser, uploadLogFile } from '@/lib/supabase-client';

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

export function UploadButton() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
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
    setStatusMessage('Preparando envio...');
  
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
  
      setStatusMessage('Enviando arquivo para o armazenamento...');
      simulateProgress(0, 35, 4000);
      const { path, url } = await uploadLogFile(file, user.id);

      setProgress(40);
      setStatusMessage('Arquivo enviado. Processando log no servidor...');
      simulateProgress(40, 70, 60000);

      const response = await fetch('/api/logs/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fileName: file.name,
          filePath: path,
          fileUrl: url,
          fileSize: file.size,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      const result = contentType.includes('application/json')
        ? await response.json()
        : { error: await response.text() };

      if (!response.ok) {
        throw new Error(result.error || `Falha no processamento do log (${response.status}).`);
      }
  
      setStatusMessage('Finalizando análise e preparando os resultados...');
      simulateProgress(Math.max(progress, 90), 100, 500);

      if (result.hasMoreErrors || result.hasMoreWarnings) {
        toast({
          title: "Aviso de processamento",
          description: "Devido ao grande volume de informações, a exibição dos dados pode levar alguns instantes.",
          duration: 6000,
        });
      }
  
      await new Promise((resolve) => setTimeout(resolve, 500));
  
      router.push(`/analysis/${result.analysisId}`);
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
              <p className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</p>
            </div>
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
          <div className="space-y-1.5">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-muted-foreground text-center">{statusMessage || 'Processando...'} {Math.round(progress)}%</p>
            {progress >= 40 && progress < 90 && (
              <p className="text-[11px] text-muted-foreground text-center">
                Logs grandes podem levar alguns minutos enquanto erros, alertas e sugestões são persistidos.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}