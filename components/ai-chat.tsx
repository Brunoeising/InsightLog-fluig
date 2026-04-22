"use client";

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { SendHorizonal, MessageSquare, Bot } from 'lucide-react';
import { answerUserQuestion } from '@/lib/claude-service';

interface AIChatProps {
  logContent: string;
  analysisId?: string;
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
}

export function AIChat({ logContent, analysisId }: AIChatProps) {
  const { toast } = useToast();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const storageKey = analysisId ? `chat_history_${analysisId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || messages.length === 0) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // ignore localStorage quota errors
    }
  }, [messages, storageKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!question.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: question,
      role: 'user',
      timestamp: new Date().toISOString(),
    };

    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantId,
      content: '',
      role: 'assistant',
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setQuestion('');
    setIsLoading(true);

    try {
      await answerUserQuestion(question, logContent, (chunk: string) => {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          )
        );
      });
    } catch {
      toast({
        title: 'Erro',
        description: 'Falha ao obter resposta da IA. Por favor, tente novamente.',
        variant: 'destructive',
      });
      setMessages(prev => prev.filter(m => m.id !== assistantId));
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
            {messages.map(message => (
              <Card
                key={message.id}
                className={
                  message.role === 'assistant'
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-secondary/30'
                }
              >
                <CardContent className="p-3">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {message.role === 'assistant' ? (
                        <Bot className="h-5 w-5 text-primary" />
                      ) : (
                        <MessageSquare className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="space-y-1 flex-1">
                      <p className="text-sm whitespace-pre-wrap">
                        {message.content}
                        {isLoading && message.role === 'assistant' && message.content === '' && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <span className="animate-bounce">.</span>
                            <span className="animate-bounce" style={{ animationDelay: '0.15s' }}>.</span>
                            <span className="animate-bounce" style={{ animationDelay: '0.3s' }}>.</span>
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
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
