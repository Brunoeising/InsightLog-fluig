"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase-client';
import { Loader2, Mail, Lock, Zap } from 'lucide-react';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('Email ou senha incorretos. Por favor, verifique suas credenciais e tente novamente.');
        }
        if (error.message.includes('Email not confirmed')) {
          throw new Error('Por favor, confirme seu email antes de fazer login. Verifique sua caixa de entrada.');
        }
        throw error;
      }

      toast({
        title: "Login realizado com sucesso",
        description: "Bem-vindo de volta!",
      });

      // Forçar atualização da sessão e redirecionar
      await supabase.auth.getSession();
      router.push('/');
      router.refresh();

    } catch (error: any) {
      toast({
        title: "Erro no login",
        description: error.message || "Ocorreu um erro ao tentar fazer login. Por favor, tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="bg-background min-h-screen flex flex-col items-center justify-center px-4">
      {/* Branding Section */}
      <div className="mb-12 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="bg-primary rounded-lg p-2 flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground">InsightLog</span>
        </div>
      </div>

      {/* Login Card */}
      <Card className="w-full max-w-sm rounded-2xl shadow-elevated border-border/60 animate-scale-in">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-bold text-foreground">Entrar</CardTitle>
          <CardDescription className="text-muted-foreground">
            Digite seus dados para continuar
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input */}
            <div className="space-y-1">
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5 group-focus-within:text-primary transition-colors" />
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 rounded-xl bg-input border border-border text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1">
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5 group-focus-within:text-primary transition-colors" />
                <Input
                  type="password"
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-11 rounded-xl bg-input border border-border text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                  required
                />
              </div>
            </div>

            {/* Forgot Password Link */}
            <div className="flex justify-end">
              <Link
                href="/auth/forgot-password"
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Esqueceu a senha?
              </Link>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 rounded-xl h-11 text-primary-foreground font-medium transition-colors"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          {/* Separator */}
          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-2 text-xs text-muted-foreground">
                Não tem uma conta?
              </span>
            </div>
          </div>

          {/* Register Button */}
          <Button
            variant="ghost"
            className="w-full rounded-xl h-11 text-foreground hover:bg-muted transition-colors"
            asChild
          >
            <Link href="/auth/register">Criar nova conta</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
