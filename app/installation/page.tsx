'use client';

import { useState, useRef, useEffect } from 'react';
import NavBar from '@/components/NavBar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BookOpen, Send, Bot, User, Copy, Check, ChevronRight,
  Terminal, AlertTriangle, Lightbulb, Server, Database,
  Monitor, Loader2, RotateCcw, Info
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  parsed?: AssistantResponse;
}

interface AssistantResponse {
  answer?: string;
  steps?: string[];
  commands?: string[];
  warnings?: string[];
  nextTopics?: string[];
}

const QUICK_TOPICS = [
  { label: 'Como instalar no Linux?', icon: Monitor },
  { label: 'Configurar banco MySQL', icon: Database },
  { label: 'Configurar banco Oracle', icon: Database },
  { label: 'Configurar banco SQL Server', icon: Database },
  { label: 'Configurar memoria JVM', icon: Server },
  { label: 'Servico nao inicia', icon: AlertTriangle },
  { label: 'Erro de conexao com banco', icon: AlertTriangle },
  { label: 'Primeiros passos pos-instalacao', icon: ChevronRight },
];

const OS_OPTIONS = [
  { value: 'linux-redhat', label: 'Red Hat / CentOS' },
  { value: 'linux-ubuntu', label: 'Ubuntu / Debian' },
  { value: 'windows-server', label: 'Windows Server' },
];

const DB_OPTIONS = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'oracle', label: 'Oracle' },
  { value: 'sqlserver', label: 'SQL Server' },
];

function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group mt-2 rounded-lg bg-muted/80 border border-border/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted">
        <div className="flex items-center gap-1.5">
          <Terminal className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">Comando</span>
        </div>
        <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="px-3 py-2.5 text-sm font-mono text-foreground overflow-x-auto whitespace-pre-wrap">{command}</pre>
    </div>
  );
}

function AssistantMessage({ parsed, rawContent }: { parsed?: AssistantResponse; rawContent: string }) {
  if (!parsed || (!parsed.answer && !parsed.steps?.length)) {
    return <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{rawContent}</p>;
  }

  return (
    <div className="space-y-4">
      {parsed.answer && (
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{parsed.answer}</p>
      )}

      {parsed.warnings && parsed.warnings.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-warning text-xs font-semibold mb-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            Atencao
          </div>
          {parsed.warnings.map((w, i) => (
            <p key={i} className="text-xs text-warning/90 leading-relaxed">{w}</p>
          ))}
        </div>
      )}

      {parsed.steps && parsed.steps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Passos</p>
          <ol className="space-y-1.5">
            {parsed.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-semibold">{i + 1}</span>
                <span className="text-foreground leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {parsed.commands && parsed.commands.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Comandos</p>
          {parsed.commands.map((cmd, i) => (
            <CommandBlock key={i} command={cmd} />
          ))}
        </div>
      )}

      {parsed.nextTopics && parsed.nextTopics.length > 0 && (
        <div className="pt-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Proximos topicos sugeridos</p>
          <div className="flex flex-wrap gap-2">
            {parsed.nextTopics.map((topic, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-primary/8 text-primary border border-primary/15 rounded-full px-2.5 py-1">
                <Lightbulb className="h-3 w-3" />
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InstallationPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [os, setOs] = useState('');
  const [db, setDb] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/install-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: { os, db, phase: 'installation' },
          conversationHistory: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error('API error');

      const data = await res.json();
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.answer || JSON.stringify(data),
        parsed: data,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Ocorreu um erro ao processar sua pergunta. Tente novamente.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const reset = () => {
    setMessages([]);
    setInput('');
    setOs('');
    setDb('');
  };

  const hasContext = os || db;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar />

      <div className="max-w-6xl mx-auto pt-24 px-4 md:px-8 pb-8">
        {/* Header */}
        <div className="mb-8 animate-slide-up">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Guia de Instalacao Fluig</h1>
              <p className="text-sm text-muted-foreground">Assistente com IA baseado na documentacao oficial</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sidebar */}
          <aside className="space-y-5">
            {/* Context selector */}
            <Card className="p-5 border-border/60">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                Contexto do ambiente
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Sistema Operacional</label>
                  <Select value={os} onValueChange={setOs}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Selecione o SO" />
                    </SelectTrigger>
                    <SelectContent>
                      {OS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Banco de Dados</label>
                  <Select value={db} onValueChange={setDb}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Selecione o banco" />
                    </SelectTrigger>
                    <SelectContent>
                      {DB_OPTIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {hasContext && (
                  <p className="text-xs text-primary flex items-center gap-1.5">
                    <Check className="h-3 w-3" />
                    Contexto aplicado as respostas
                  </p>
                )}
              </div>
            </Card>

            {/* Quick topics */}
            <Card className="p-5 border-border/60">
              <h3 className="text-sm font-semibold mb-4">Topicos rapidos</h3>
              <div className="space-y-1">
                {QUICK_TOPICS.map((topic) => (
                  <button
                    key={topic.label}
                    onClick={() => sendMessage(topic.label)}
                    disabled={loading}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <topic.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground/80">{topic.label}</span>
                  </button>
                ))}
              </div>
            </Card>

            {/* Info card */}
            <Card className="p-4 border-warning/20 bg-warning/5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-warning mb-1">Lembre-se sempre</p>
                  <p className="text-xs text-warning/80 leading-relaxed">
                    Faca backup do banco e do volume antes de qualquer atualizacao. Reverter para versao anterior nao e possivel.
                  </p>
                </div>
              </div>
            </Card>
          </aside>

          {/* Chat area */}
          <div className="lg:col-span-2 flex flex-col">
            <Card className="flex-1 flex flex-col border-border/60 overflow-hidden" style={{ minHeight: '600px' }}>
              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6" style={{ maxHeight: '520px' }}>
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <div className="w-16 h-16 rounded-2xl bg-primary/8 flex items-center justify-center mb-5">
                      <Bot className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Assistente de Instalacao Fluig</h3>
                    <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-6">
                      Pergunte sobre instalacao no Linux ou Windows, configuracao de banco de dados, erros comuns e configuracao da JVM.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {QUICK_TOPICS.slice(0, 4).map((t) => (
                        <button
                          key={t.label}
                          onClick={() => sendMessage(t.label)}
                          className="text-xs bg-accent hover:bg-accent/80 text-foreground rounded-full px-3 py-1.5 transition-colors"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-muted/60 border border-border/40 rounded-tl-sm'
                    }`}>
                      {msg.role === 'user' ? (
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      ) : (
                        <AssistantMessage parsed={msg.parsed} rawContent={msg.content} />
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
                        <User className="h-4 w-4 text-foreground" />
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="bg-muted/60 border border-border/40 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Consultando documentacao...</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="border-t border-border/40 p-4">
                {messages.length > 0 && (
                  <div className="flex justify-end mb-3">
                    <button
                      onClick={reset}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Nova conversa
                    </button>
                  </div>
                )}
                <form onSubmit={handleSubmit} className="flex gap-3">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Pergunte sobre instalacao, configuracao ou erros do Fluig..."
                    className="resize-none min-h-[60px] max-h-[120px] text-sm"
                    rows={2}
                    disabled={loading}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!input.trim() || loading}
                    className="h-[60px] w-12 shrink-0 bg-primary hover:bg-primary/90"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground mt-2.5">
                  Enter para enviar · Shift+Enter para nova linha · Selecione o contexto na barra lateral para respostas mais precisas
                </p>
              </div>
            </Card>

            {/* Context badges */}
            {hasContext && (
              <div className="flex items-center gap-2 mt-3 px-1">
                <span className="text-xs text-muted-foreground">Contexto ativo:</span>
                {os && <Badge variant="secondary" className="text-xs">{OS_OPTIONS.find(o => o.value === os)?.label}</Badge>}
                {db && <Badge variant="secondary" className="text-xs">{DB_OPTIONS.find(d => d.value === db)?.label}</Badge>}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
