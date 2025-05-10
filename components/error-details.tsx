"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LogErrorEntry } from '@/lib/types';
import { AlertTriangle, ChevronDown, ChevronUp, Clock, Code2, FileText, Loader2, CalendarDays, MessageSquare, Sparkles } from 'lucide-react';
import { analyzeLogErrors } from '@/lib/openai-service';
import { useToast } from '@/hooks/use-toast';
import { getCategoryColor } from '@/app/analysis/[id]/helpers';


interface ErrorDetailsProps {
  error: LogErrorEntry;
  index: number;
  isExpanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  categoryNameMap: Record<string, { name: string; color?: string }>;
}

export function ErrorDetails({ error, index, isExpanded = false, onToggle, categoryNameMap }: ErrorDetailsProps) {
  const [isOpen, setIsOpen] = useState(isExpanded);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setIsOpen(isExpanded);
  }, [isExpanded]);

  const handleToggle = (open: boolean) => {
    setIsOpen(open);
    onToggle?.(open);
  };

  const handleAIAnalysis = async () => {
    if (aiSuggestion) {
      setShowSuggestion(true);
      return;
    }

    setIsLoadingAI(true);
    setShowSuggestion(true);

    try {
      const analysis = await analyzeLogErrors({
        logContent: [
          ...(error.contextBefore || []),
          `${error.timestamp} ${error.message}`,
          ...(error.contextAfter || [])
        ].join('\n'),
        errorEntries: [error]
      });

      const suggestion = analysis.errorAnalysis[0]?.suggestion ||
        'Não foi possível gerar uma sugestão específica para este erro.';

      setAiSuggestion(suggestion);
    } catch (error) {
      toast({
        title: "Erro na análise",
        description: "Não foi possível gerar uma sugestão para este erro.",
        variant: "destructive",
      });
      setShowSuggestion(false);
    } finally {
      setIsLoadingAI(false);
    }
  };

  const translateCategory = (category: string): string => {
    const translations: Record<string, string> = {
      'DATABASE': 'Banco de Dados',
      'PERMISSION': 'Permissão',
      'WORKFLOW': 'Workflow',
      'PERFORMANCE': 'Performance',
      'NETWORK': 'Rede',
      'INFRASTRUCTURE': 'Infraestrutura',
      'OTHER': 'Outros'
    };

    return translations[category] || category;
  };

  const categoryColor = getCategoryColor(error.category || 'OTHER', categoryNameMap);

  function parseAndFormatDate(timestamp: string | { toDate: () => Date } | { seconds: number } | number | Date): string {
    try {
      // Se for timestamp do Firebase Firestore
      if ((timestamp as { toDate: () => Date })?.toDate) {
        const date = (timestamp as { toDate: () => Date }).toDate();
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      }
      
      // Se for timestamp em segundos (Firestore)
      if ((timestamp as { seconds: number })?.seconds) {
        const date = new Date((timestamp as { seconds: number }).seconds * 1000);
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      }
  
      // Se for string no formato "2025-03-24 01:40:47,730"
      if (typeof timestamp === 'string') {
        const datePart = timestamp.split(' ')[0];
        const [year, month, day] = datePart.split('-');
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }
  
      // Se for objeto Date ou timestamp numérico
      const date = new Date(timestamp as number | Date);
      if (!isNaN(date.getTime())) {
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      }
  
      return 'Data inválida';
    } catch (error) {
      console.error('Erro ao formatar data:', error);
      return '--/--/----';
    }
  }
  
  interface TimestampWithToDate {
    toDate: () => Date;
  }

  interface TimestampWithSeconds {
    seconds: number;
  }

  function parseAndFormatTime(
    timestamp: string | TimestampWithToDate | TimestampWithSeconds | number | Date
  ): string {
    try {
      // Se for string no formato "2025-03-24 01:40:47,730"
      if (typeof timestamp === 'string') {
        const timePart = timestamp.split(' ')[1]?.split(',')[0];
        return timePart || '--:--:--';
      }
  
      // Se for timestamp do Firebase Firestore
      if ((timestamp as TimestampWithToDate)?.toDate) {
        const date = (timestamp as TimestampWithToDate).toDate();
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
      }
      
      // Se for timestamp em segundos (Firestore)
      if ((timestamp as TimestampWithSeconds)?.seconds) {
        const date = new Date((timestamp as TimestampWithSeconds).seconds * 1000);
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
      }
  
      // Se for objeto Date ou timestamp numérico
      const date = new Date(timestamp as number | Date);
      if (!isNaN(date.getTime())) {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
      }
  
      return '--:--:--';
    } catch (error) {
      console.error('Erro ao formatar hora:', error);
      return '--:--:--';
    }
  }

  return (
    <Card className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-background">
      <CardHeader className="px-4 py-3 bg-gradient-to-r from-muted/5 to-background border-b">
      <div className="flex items-center justify-between gap-2">
    {/* Lado esquerdo - Identificação premium */}
    <div className="flex items-center gap-2.5">
      <div className="p-1.5 rounded-md bg-primary/10">
        <FileText className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium leading-none">Erro #{index + 1}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>{parseAndFormatDate(error.timestamp)}</span>
          <Clock className="h-3.5 w-3.5 ml-1" />
          <span>{parseAndFormatTime(error.timestamp)}</span>
        </div>
      </div>
    </div>
    
    {/* Lado direito - Categoria com destaque */}
    <div className="flex items-center gap-2">
      <div className="relative">
        <Badge 
          variant="outline"
          className="pl-2.5 pr-3 py-1 rounded-full border-muted/30 bg-background shadow-xs backdrop-blur-sm"
          style={{
            borderLeft: `3px solid ${categoryColor}`,
            boxShadow: `0 0 0 1px ${categoryColor}20`
          }}
        >
          <span className="flex items-center gap-1.5">
            <div 
              className="h-2 w-2 rounded-full animate-pulse" 
              style={{ backgroundColor: categoryColor }}
            />
            <span className="text-xs font-medium tracking-wide">
              {translateCategory(error.category || 'OTHER')}
            </span>
          </span>
        </Badge>
      </div>
    </div>
  </div>
</CardHeader>

      <CardContent className="p-4">
        <Collapsible
          open={isOpen}
          onOpenChange={handleToggle}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-primary/30 hover:bg-primary/5 hover:border-primary/40"
              onClick={handleAIAnalysis}
              disabled={isLoadingAI}
            >
              {isLoadingAI ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analisando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>Analisar com IA</span>
                </>
              )}
            </Button>

            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/30">
                <span>Contexto</span>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="mt-4 space-y-4 animate-collapsible">
            {/* Sugestão da IA - Só aparece após clicar no botão */}
            {aiSuggestion && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-medium">Sugestão da IA</h4>
                </div>
                <div className="text-sm [&>p]:mb-3 [&>p]:last:mb-0">
                  {aiSuggestion}
                </div>
              </div>
            )}

            {/* Contexto Anterior */}
            {error.contextBefore && error.contextBefore.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Code2 className="h-4 w-4 text-muted-foreground/70" />
                  <h4 className="text-sm font-medium text-muted-foreground">Contexto Anterior</h4>
                </div>
                <ScrollArea className="h-[120px] rounded-lg border bg-muted/5 p-3">
                  <div className="space-y-1.5">
                    {error.contextBefore.map((line, i) => (
                      <p key={i} className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                        {line}
                      </p>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Linha do Erro */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h4 className="text-sm font-medium">Detalhes do Erro</h4>
              </div>
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-xs font-mono text-destructive whitespace-pre-wrap">
                  {error.message}
                </p>
              </div>
            </div>

            {/* Contexto Posterior */}
            {error.contextAfter && error.contextAfter.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Code2 className="h-4 w-4 text-muted-foreground/70" />
                  <h4 className="text-sm font-medium text-muted-foreground">Contexto Posterior</h4>
                </div>
                <ScrollArea className="h-[120px] rounded-lg border bg-muted/5 p-3">
                  <div className="space-y-1.5">
                    {error.contextAfter.map((line, i) => (
                      <p key={i} className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                        {line}
                      </p>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}