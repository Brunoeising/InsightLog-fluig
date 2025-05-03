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
    <main className="min-h-screen p-6 md:p-10">
      <header className="fixed top-0 left-0 right-0 bg-background/80 backdrop-blur-sm z-50 border-b px-6 md:px-10">
        <div className="max-w-7xl mx-auto flex h-16 items-center justify-between">
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

      <div className="max-w-7xl mx-auto pt-24">
        <section className="flex flex-col items-center justify-center mb-16">
          <div className="max-w-3xl w-full text-center space-y-4">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Análise Automatizada de Logs do <span className="text-primary">Fluig</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Faça upload dos seus logs do sistema Fluig para obter insights instantâneos com IA, resumos e soluções.
            </p>
            
            <UploadButton />
          </div>
        </section>

        <section className="mb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <FileText className="h-10 w-10 text-primary mb-4" />
                  <h3 className="text-xl font-medium mb-2">Análise Inteligente de Logs</h3>
                  <p className="text-muted-foreground">
                    Extrai automaticamente erros, avisos e contexto relevante dos seus logs.
                  </p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <BarChart2 className="h-10 w-10 text-primary mb-4" />
                  <h3 className="text-xl font-medium mb-2">Análise com IA</h3>
                  <p className="text-muted-foreground">
                    Obtenha resumos inteligentes e soluções práticas baseadas nos problemas detectados.
                  </p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <Shield className="h-10 w-10 text-primary mb-4" />
                  <h3 className="text-xl font-medium mb-2">Processamento Seguro</h3>
                  <p className="text-muted-foreground">
                    Seus dados de log são processados com segurança e nunca compartilhados com terceiros.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
        
        <HowItWorks />
      </div>
      
      <footer className="border-t mt-16">
        <div className="max-w-7xl mx-auto py-6 text-center text-muted-foreground">
          <p>© 2025 InsightLog. Todos os direitos reservados.</p>
        </div>
      </footer>
    </main>
  );
}