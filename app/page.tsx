'use client';

import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Gauge,
  History,
  Server,
  Settings,
  Shield,
  Upload,
} from 'lucide-react';

const PRIMARY_ACTIONS = [
  {
    title: 'Análise de Logs',
    description: 'Envie logs do Fluig, acompanhe diagnósticos e converse com a IA sobre os erros encontrados.',
    href: '/history',
    action: 'Abrir análises de logs',
    icon: FileSearch,
    accent: 'bg-primary/10 text-primary border-primary/20',
  },
  {
    title: 'Análise de Ambiente',
    description: 'Valide SO, Java, banco, sizing e health check contra regras de compatibilidade.',
    href: '/environment/new',
    action: 'Nova análise de ambiente',
    icon: Server,
    accent: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  },
  {
    title: 'Guia de Instalação',
    description: 'Consulte passos, comandos e solução de erros comuns para instalar e configurar o Fluig.',
    href: '/installation',
    action: 'Abrir assistente',
    icon: BookOpen,
    accent: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
];

const SECONDARY_ACTIONS = [
  { label: 'Histórico de ambiente', href: '/environment/history', icon: History },
  { label: 'Auditoria', href: '/audit', icon: Shield },
  { label: 'Configurações', href: '/settings', icon: Settings },
];

const WORKFLOW = [
  { title: 'Coletar', description: 'Log, inventário ou contexto da instalação.', icon: Upload },
  { title: 'Diagnosticar', description: 'Parser, regras e IA identificam riscos.', icon: BarChart3 },
  { title: 'Priorizar', description: 'Categorias, impacto e sugestões acionáveis.', icon: Gauge },
  { title: 'Resolver', description: 'Execute correções e registre evidências.', icon: CheckCircle2 },
];

export default function Home() {
  const router = useRouter();

  return (
    <AppShell contentClassName="bg-gradient-to-b from-background via-background to-secondary/20">
      <div className="mx-auto max-w-7xl space-y-8 pb-10">
        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-xl border bg-card p-6 shadow-sm md:p-8">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                Operação Fluig
              </Badge>
              <Badge variant="secondary">Logs</Badge>
              <Badge variant="secondary">Ambiente</Badge>
              <Badge variant="secondary">Instalação</Badge>
            </div>
            <div className="max-w-3xl">
              <h1 className="text-3xl font-bold leading-tight text-foreground md:text-4xl">
                Painel de diagnóstico e suporte para ambientes Fluig
              </h1>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Centralize análise de logs, validação de ambiente e orientação de instalação em fluxos prontos para investigação técnica.
              </p>
            </div>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => router.push('/history')} className="gap-2">
                Analisar logs
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push('/environment/new')} className="gap-2">
                Validar ambiente
                <Server className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Card className="border-warning/20 bg-warning/5">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Antes de atuar em produção</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Priorize evidências do log e valide compatibilidade antes de mudanças em JVM, banco ou infraestrutura.</p>
              <div className="rounded-lg border border-warning/20 bg-background/70 p-3 text-xs leading-relaxed">
                Faça backup do banco e do volume antes de updates, ajustes de instalação ou mudanças estruturais.
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {PRIMARY_ACTIONS.map((action) => (
            <Card key={action.title} className="group border-border/70 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
              <CardContent className="flex h-full flex-col p-6">
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-lg border ${action.accent}`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">{action.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{action.description}</p>
                <Button variant="ghost" className="mt-5 justify-start gap-2 px-0 text-primary hover:bg-transparent hover:text-primary/80" onClick={() => router.push(action.href)}>
                  {action.action}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                Acessos rápidos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {SECONDARY_ACTIONS.map((action) => (
                <button
                  key={action.href}
                  onClick={() => router.push(action.href)}
                  className="flex w-full items-center justify-between rounded-lg border bg-background px-3 py-3 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span className="flex items-center gap-2 text-foreground">
                    <action.icon className="h-4 w-4 text-muted-foreground" />
                    {action.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Fluxo recomendado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {WORKFLOW.map((step, index) => (
                  <div key={step.title} className="rounded-lg border bg-background p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <step.icon className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">0{index + 1}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
