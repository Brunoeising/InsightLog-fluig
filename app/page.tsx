'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Server, BookOpen, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { HowItWorks } from '@/components/how-it-works';
import { AppShell } from '@/components/app-shell';

const FEATURES = [
  'Validacao contra Matriz de Portabilidade oficial',
  'Simulacao de dimensionamento de hardware',
  'Health check com metricas de sistema',
]

export default function Home() {
  const router = useRouter();

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto pb-20">
        {/* Hero */}
        <section className="text-center max-w-2xl mx-auto mb-20 animate-slide-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/8 border border-primary/15 text-primary text-sm font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            Analise inteligente para Fluig
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-[1.15] mb-4">
            Valide, dimensione e instale o Fluig com precisao
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mx-auto mb-8">
            Da analise do ambiente ate a instalacao guiada por IA, tudo em um lugar.
          </p>
          <Button size="lg" onClick={() => router.push('/history')} className="bg-primary hover:bg-primary/90">
            Analisar logs
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </section>

        {/* Two-pillar CTA cards */}
        <section className="mb-20 grid grid-cols-1 md:grid-cols-2 gap-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
          {/* Environment Analysis */}
          <Card className="relative overflow-hidden border-primary/15 bg-gradient-to-br from-primary/5 via-transparent to-transparent p-8">
            <div className="flex flex-col h-full">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                <Server className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Analise de Ambiente</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6 flex-1">
                Execute scripts no seu servidor, valide SO, Java, banco e dimensionamento contra a Matriz de Portabilidade e o Modelo de Dimensionamento oficiais.
              </p>
              <ul className="space-y-1.5 mb-6">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
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

          {/* Installation Guide */}
          <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-muted/30 via-transparent to-transparent p-8">
            <div className="flex flex-col h-full">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-5">
                <BookOpen className="h-6 w-6 text-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Guia de Instalacao com IA</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6 flex-1">
                Assistente interativo que guia a instalacao do Fluig no Linux ou Windows, configuracao de banco de dados e resolucao de erros comuns.
              </p>
              <ul className="space-y-1.5 mb-6">
                {['Instalacao Linux com instalador grafico ou modo texto', 'Configuracao MySQL, Oracle e SQL Server', 'Diagnostico de erros comuns de instalacao'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="flex gap-3">
                <Button onClick={() => router.push('/installation')} variant="outline" className="border-foreground/20 hover:bg-accent">
                  Abrir Guia
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </div>
          </Card>
        </section>

        {/* How it works */}
        <section className="mb-20">
          <HowItWorks />
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t bg-card/50">
        <div className="max-w-6xl mx-auto py-6 px-6 md:px-8 flex items-center justify-between text-sm text-muted-foreground">
          <p>InsightLog</p>
          <p>2025</p>
        </div>
      </footer>
    </AppShell>
  );
}
