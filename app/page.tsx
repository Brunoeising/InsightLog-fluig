'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { UploadButton } from '@/components/upload-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserNav } from '@/components/user-nav';
import { FileText, BarChart2, Zap, Shield, Settings } from 'lucide-react';
import { HowItWorks } from '@/components/how-it-works';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-secondary/10 text-foreground">
  {/* Cabeçalho fixo */}
  <header className="fixed top-0 left-0 right-0 bg-background/80 backdrop-blur-sm z-50 border-b px-6 md:px-10">
    <div className="flex w-full h-16 items-center justify-between">
      <div className="flex items-center gap-2">
        <Zap className="h-6 w-6 text-primary" />
        <span className="text-xl font-bold">InsightLog</span>
      </div>
      <div className="flex items-center gap-4">
        <Link href="/history">
          <Button variant="ghost">Histórico</Button>
        </Link>
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <Settings className="h-5 w-5" />
          </Button>
        </Link>
        <ThemeToggle />
        <UserNav />
      </div>
    </div>
  </header>

  {/* Conteúdo principal */}
  <div className="max-w-7xl mx-auto pt-24 px-6 md:px-10 space-y-24">

    {/* Hero */}
    <section className="text-center space-y-6 max-w-3xl mx-auto">
  <img
    src="/images/title.gif"
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