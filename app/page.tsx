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


export default function Home() {
  const router = useRouter();

  return (
    <AppShell contentClassName="bg-gradient-to-b from-background via-background to-secondary/20">
      <div className="mx-auto max-w-7xl space-y-8 pb-10">
        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-xl border bg-card p-6 shadow-sm md:p-8">
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
      </div>
    </AppShell>
  );
}
