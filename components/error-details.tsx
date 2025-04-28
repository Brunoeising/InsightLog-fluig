"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LogErrorEntry } from '@/lib/types';
import { ChevronDown, ChevronUp, Clock, MessageSquare } from 'lucide-react';

interface ErrorDetailsProps {
  error: LogErrorEntry;
  index: number;
}

export function ErrorDetails({ error, index }: ErrorDetailsProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
      'DATABASE': 'text-chart-1 border-chart-1/50 bg-chart-1/10',
      'PERMISSION': 'text-chart-2 border-chart-2/50 bg-chart-2/10',
      'WORKFLOW': 'text-chart-3 border-chart-3/50 bg-chart-3/10',
      'PERFORMANCE': 'text-chart-4 border-chart-4/50 bg-chart-4/10',
      'NETWORK': 'text-chart-5 border-chart-5/50 bg-chart-5/10',
      'OTHER': 'text-muted-foreground border-muted/50 bg-muted/20'
    };
    
    return colors[category] || colors['OTHER'];
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <CardTitle className="text-base">
            <span className="font-normal text-muted-foreground mr-2">#{index + 1}</span>
            {error.message && error.message.length > 100 
              ? `${error.message.substring(0, 100)}...` 
              : error.message}
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getCategoryColor(error.category || 'OTHER')}>
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
          onOpenChange={setIsOpen}
          className="space-y-2"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm">
              {error.suggestion || "Sugestão da IA para este erro está pendente."}
            </p>
            
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
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function translateCategory(category: string): string {
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
}