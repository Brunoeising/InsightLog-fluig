"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from "@/hooks/use-toast"
import { SendHorizontal as SendHorizonal, MessageSquare, Bot } from 'lucide-react';
import { answerUserQuestion } from '@/lib/openai-service';

interface AIChatProps {
  logContent: string;
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
}

export function AIChat({ logContent }: AIChatProps) {
  const { toast } = useToast();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const analysisId = JSON.parse(localStorage.getItem('currentAnalysis') || '{}').id;
    if (analysisId) {
      const savedMessages = localStorage.getItem(`chat_history_${analysisId}`);
      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      }
    }
  }, []);

  useEffect(() => {
    const analysisId = JSON.parse(localStorage.getItem('currentAnalysis') || '{}').id;
    if (analysisId && messages.length > 0) {
      localStorage.setItem(`chat_history_${analysisId}`, JSON.stringify(messages));
    }
  }, [messages]);

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
      await answerUserQuestion(question, logContent, (chunk) => {
        accumulated += chunk;
      });
      
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
                    <div className="space-y-1 flex-1">
                      <p className="text-sm">
                        {message.content}
                      </p>
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