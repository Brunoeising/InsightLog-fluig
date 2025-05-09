"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LogErrorEntry } from '@/lib/types';
import { ChevronDown, ChevronUp, Clock, MessageSquare, Sparkles } from 'lucide-react';
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

  return (
    <Card style={{ borderLeft: `4px solid ${categoryColor}` }}>
      <CardHeader className="pb-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <CardTitle className="text-base">
            <span className="font-normal text-muted-foreground mr-2">#{index + 1}</span>
            {error.message && error.message.length > 100 
              ? `${error.message.substring(0, 100)}...` 
              : error.message}
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" style={{ backgroundColor: `${categoryColor}20`, borderColor: `${categoryColor}50` }}>
              {translateCategory(error.category || 'OTHER')}
            </Badge>
            
            <div className="flex items-center text-xs text-muted-foreground">
              <Clock className="h-3 w-3 mr-1" />
              {error.timestamp}
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Collapsible
          open={isOpen}
          onOpenChange={handleToggle}
          className="space-y-2"
        >
          <div className="flex items-center justify-between">
            {error.suggestion ? (
              <p className="text-sm">{error.suggestion}</p>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={handleAIAnalysis}
                disabled={isLoadingAI}
              >
                <Sparkles className="h-4 w-4" />
                {isLoadingAI ? 'Analisando...' : 'Analisar com IA'}
              </Button>
            )}
            
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                <span>Contexto</span>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
          
          <CollapsibleContent className="mt-4">
            <div className="space-y-4">
              {/* Contexto Anterior */}
              {error.contextBefore && error.contextBefore.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Contexto Anterior</h4>
                  <ScrollArea className="h-[150px] rounded-md border p-2 bg-muted/20">
                    <div className="space-y-1">
                      {error.contextBefore.map((line, i) => (
                        <p key={i} className="text-xs font-mono whitespace-pre-wrap">
                          {line}
                        </p>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
              
              {/* Linha do Erro */}
              <div>
                <h4 className="text-sm font-medium mb-2">Erro</h4>
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2">
                  <p className="text-xs font-mono text-destructive whitespace-pre-wrap">
                    {error.timestamp} {error.message}
                  </p>
                </div>
              </div>
              
              {/* Contexto Posterior */}
              {error.contextAfter && error.contextAfter.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Contexto Posterior</h4>
                  <ScrollArea className="h-[150px] rounded-md border p-2 bg-muted/20">
                    <div className="space-y-1">
                      {error.contextAfter.map((line, i) => (
                        <p key={i} className="text-xs font-mono whitespace-pre-wrap">
                          {line}
                        </p>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Sugestão da IA */}
              {showSuggestion && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Sugestão da IA</h4>
                  <div className="rounded-md border p-3 bg-primary/5">
                    {isLoadingAI ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                        <span>Gerando sugestão...</span>
                      </div>
                    ) : (
                      <p className="text-sm">{aiSuggestion}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}