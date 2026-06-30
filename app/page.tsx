'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { UploadButton } from '@/components/upload-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserNav } from '@/components/user-nav';
import { FileText, BarChart2, Zap, Shield, Settings, Server } from 'lucide-react';
import { HowItWorks } from '@/components/how-it-works';
import NavBar from "@/components/NavBar"


export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-secondary/10 text-foreground">
  {/* Cabeçalho fixo */}
  <NavBar />



  {/* Conteúdo principal */}
  <div className="max-w-7xl mx-auto pt-24 px-6 md:px-10 space-y-24">

    {/* Hero */}
    <section className="text-center space-y-6 max-w-3xl mx-auto">
  <img
    src="/images/InsightLog.png"
    alt="Título animado"
    className="mx-auto w-full max-w-md"
  />
 <p className="text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
  Envie os logs do sistema Fluig e receba análises com inteligência artificial, resumos claros e sugestões precisas em segundos.
</p>

  <UploadButton />
</section>


    {/* Cards de benefícios */}
    <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="p-6 shadow-lg border border-border/40 rounded-3xl transform transition-all duration-300 hover:scale-105 hover:shadow-xl hover:border-[#245C90] flex flex-col items-center text-center space-y-4">
        <img src="/images/log-analysis.svg" alt="Análise de logs" className="w-24 h-24 object-contain" />
        <h3 className="text-xl font-semibold">Análise Inteligente de Logs</h3>
        <p className="text-muted-foreground">
          Extrai automaticamente erros, avisos e contexto relevante dos seus logs.
        </p>
      </Card>

      <Card className="p-6 shadow-lg border border-border/40 rounded-3xl transform transition-all duration-300 hover:scale-105 hover:shadow-xl hover:border-[#245C90] flex flex-col items-center text-center space-y-4">
        <img src="/images/ai-support.svg" alt="IA" className="w-24 h-24 object-contain" />
        <h3 className="text-xl font-semibold">Análise com IA</h3>
        <p className="text-muted-foreground">
          Obtenha resumos inteligentes e soluções práticas baseadas nos problemas detectados.
        </p>
      </Card>

      <Card className="p-6 shadow-lg border border-border/40 rounded-3xl transform transition-all duration-300 hover:scale-105 hover:shadow-xl hover:border-[#245C90] flex flex-col items-center text-center space-y-4">
        <img src="/images/security.svg" alt="Segurança" className="w-24 h-24 object-contain" />
        <h3 className="text-xl font-semibold">Processamento Seguro</h3>
        <p className="text-muted-foreground">
          Seus dados de log são processados com segurança e nunca compartilhados com terceiros.
        </p>
      </Card>
    </section>

    {/* Análise de Ambiente */}
    <section>
      <Card className="p-8 shadow-xl border border-[#245C90]/30 rounded-3xl bg-gradient-to-br from-[#245C90]/5 to-transparent">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="flex-shrink-0">
            <div className="w-20 h-20 rounded-2xl bg-[#245C90]/10 flex items-center justify-center">
              <Server className="h-10 w-10 text-[#245C90]" />
            </div>
          </div>
          <div className="flex-1 text-center md:text-left">
            <h3 className="text-2xl font-bold mb-2">Análise de Ambiente Fluig</h3>
            <p className="text-muted-foreground mb-4 max-w-2xl">
              Valide seu ambiente contra a Matriz de Portabilidade, simule dimensionamento de infraestrutura
              e execute health checks com interpretação por IA. Colete dados com scripts prontos e receba
              relatórios técnicos e executivos.
            </p>
            <div className="flex flex-wrap gap-3 justify-center md:justify-start">
              <Button onClick={() => window.location.href = '/environment/new'} className="bg-[#245C90] hover:bg-[#1e4d7a]">
                <Server className="h-4 w-4 mr-2" /> Nova Análise
              </Button>
              <Button variant="outline" onClick={() => window.location.href = '/environment/history'}>
                Ver Histórico
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </section>

    {/* Como funciona */}
    <section>
      <HowItWorks />
    </section>
  </div>

  {/* Rodapé */}
  <footer className="border-t mt-24">
    <div className="max-w-7xl mx-auto py-6 text-center text-muted-foreground">
      <p>© 2025 InsightLog. Todos os direitos reservados.</p>
    </div>
  </footer>
</main>

  );
}