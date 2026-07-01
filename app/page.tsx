'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { UploadButton } from '@/components/upload-button';
import { Server, Wrench, FileCode, Globe, Activity, ClipboardCheck, ArrowRight, Sparkles } from 'lucide-react';
import { HowItWorks } from '@/components/how-it-works';
import NavBar from "@/components/NavBar"

const TOOLS = [
  {
    href: '/troubleshoot',
    icon: Wrench,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    title: 'Diagnostico de Instalacao',
    description: 'Cole o erro e receba diagnostico com solucoes baseadas no TDN.',
  },
  {
    href: '/configuration',
    icon: FileCode,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    title: 'Validador de Configuracao',
    description: 'Valide standalone.xml e parametros de banco contra boas praticas.',
  },
  {
    href: '/integrations',
    icon: Globe,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    title: 'Diagnostico de Integracoes',
    description: 'Diagnostique erros SOAP/REST e gere configuracoes de endpoints.',
  },
  {
    href: '/monitoring',
    icon: Activity,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    title: 'Monitoramento Preditivo',
    description: 'Analise tendencias e preveja falhas antes que impactem producao.',
  },
  {
    href: '/installation/readiness',
    icon: ClipboardCheck,
    color: 'text-teal-500',
    bg: 'bg-teal-500/10',
    title: 'Checklist Pre-Instalacao',
    description: 'Verifique todos os requisitos antes de instalar o Fluig.',
  },
];

export default function Home() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar />

      <div className="max-w-6xl mx-auto pt-28 px-6 md:px-8 pb-20">
        {/* Hero */}
        <section className="text-center max-w-2xl mx-auto mb-20 animate-slide-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/8 border border-primary/15 text-primary text-sm font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            Analise inteligente para Fluig
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-[1.15] mb-4">
            Insights automaticos para seus ambientes Fluig
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mx-auto mb-8">
            Envie logs, valide configuracoes e monitore saude com inteligencia artificial.
          </p>
          <UploadButton />
        </section>

        {/* Environment Analysis CTA */}
        <section className="mb-20 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <Card className="relative overflow-hidden border-primary/15 bg-gradient-to-br from-primary/5 via-transparent to-transparent p-8 md:p-10">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Server className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-1.5">Analise de Ambiente Fluig</h2>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-xl">
                  Valide contra a Matriz de Portabilidade, simule dimensionamento e execute health checks com IA.
                </p>
              </div>
              <div className="flex gap-3">
                <Button onClick={() => router.push('/environment/new')} className="bg-primary hover:bg-primary/90">
                  Nova Analise
                </Button>
                <Button variant="outline" onClick={() => router.push('/environment/history')}>
                  Historico
                </Button>
              </div>
            </div>
          </Card>
        </section>

        {/* How it works */}
        <section className="mb-20">
          <HowItWorks />
        </section>

        {/* Tools Grid */}
        <section className="animate-slide-up" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center gap-3 mb-8">
            <h2 className="text-2xl font-semibold">Ferramentas com IA</h2>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {TOOLS.map((tool) => (
              <Link key={tool.href} href={tool.href}>
                <Card className="group p-5 h-full border border-border/60 hover:border-primary/30 hover:shadow-soft transition-all duration-200 cursor-pointer">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl ${tool.bg} flex items-center justify-center shrink-0`}>
                      <tool.icon className={`h-5 w-5 ${tool.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-sm">{tool.title}</h3>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{tool.description}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t bg-card/50">
        <div className="max-w-6xl mx-auto py-6 px-6 md:px-8 flex items-center justify-between text-sm text-muted-foreground">
          <p>InsightLog</p>
          <p>2025</p>
        </div>
      </footer>
    </main>
  );
}
