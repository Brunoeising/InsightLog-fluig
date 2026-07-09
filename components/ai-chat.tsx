"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from "@/hooks/use-toast"
import { SendHorizontal as SendHorizonal, MessageSquare, Bot, Target, X } from 'lucide-react';
import { askAboutAnalysis } from '@/lib/ai-client';
import { AIResponse } from '@/components/ai-response';

interface AIChatProps {
  analysisId: string;
  activeFingerprint?: string | null;
  onFingerprintCleared?: () => void;
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
}

export function AIChat({ analysisId, activeFingerprint, onFingerprintCleared }: AIChatProps) {
  const { toast } = useToast();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (analysisId) {
      const savedMessages = localStorage.getItem(`chat_history_${analysisId}`);
      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      }
    }
  }, [analysisId]);

  useEffect(() => {
    if (analysisId && messages.length > 0) {
      localStorage.setItem(`chat_history_${analysisId}`, JSON.stringify(messages.slice(-50)));
    }
  }, [analysisId, messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!question.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      content: question,
      role: 'user',
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setQuestion('');
    setIsLoading(true);
    
    let accumulated = '';
    try {
      await askAboutAnalysis(
        question,
        analysisId,
        (chunk) => {
          accumulated += chunk;
        },
        activeFingerprint ? { fingerprint: activeFingerprint } : {}
      );
      
      const assistantMessage: Message = {
        id: Date.now().toString(),
        content: accumulated || 'Sem resposta da IA.',
        role: 'assistant',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Erro ao obter resposta:', error);
      toast({
        title: "Erro",
        description: "Falha ao obter resposta da IA. Por favor, tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-[600px]">
      {activeFingerprint && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-foreground">
              Chat focado em <span className="font-medium">um erro específico</span>. A IA vai priorizar este padrão.
            </span>
          </div>
          {onFingerprintCleared && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={onFingerprintCleared}
            >
              <X className="h-3.5 w-3.5" />
              Limpar foco
            </Button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto mb-4 border rounded-md p-4 bg-card">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Bot className="h-12 w-12 mb-4 opacity-20" />
            <p>Me pergunte qualquer coisa sobre seu arquivo de log.</p>
            <p className="text-sm mt-2">
              Posso ajudar a identificar problemas, explicar mensagens de erro e sugerir soluções.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <Card key={message.id} className={`${
                message.role === 'assistant' 
                  ? 'bg-primary/5 border-primary/20' 
                  : 'bg-secondary/30'
              }`}>
                <CardContent className="p-3">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {message.role === 'assistant' ? (
                        <Bot className="h-5 w-5 text-primary" />
                      ) : (
                        <MessageSquare className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="space-y-2 flex-1 min-w-0">
                      {message.role === 'assistant' ? (
                        <AIResponse content={message.content} />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                <span>Analisando e gerando resposta...</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Faça uma pergunta sobre seu arquivo de log..."
          className="flex-1 resize-none"
          disabled={isLoading}
          rows={1}
        />
        <Button type="submit" size="icon" disabled={isLoading || !question.trim()}>
          <SendHorizonal className="h-5 w-5" />
        </Button>
      </form>
    </div>
  );
}