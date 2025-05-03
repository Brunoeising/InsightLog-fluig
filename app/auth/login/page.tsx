"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase-client';
import { Loader2, Mail, Lock } from 'lucide-react';
import { useState } from 'react';
import { Checkbox } from '@radix-ui/react-checkbox';

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
    <main className="min-h-screen flex bg-background text-foreground">
    {/* Ilustração à esquerda (oculta em telas pequenas) */}
    <div className="hidden lg:flex w-1/2 items-center justify-center bg-card p-12">
      <div className="max-w-md text-center space-y-4">
        <img
          src="/login.svg"
          alt="Ilustração"
          className="w-full h-auto max-h-80 opacity-80 mx-auto"
        />
        <h2 className="text-3xl font-bold text-card-foreground">Bem-vindo de volta</h2>
        <p className="text-muted-foreground">
          Acesse sua conta para continuar usando a plataforma.
        </p>
      </div>
    </div>
  
    {/* Formulário à direita */}
    <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">Entrar</h1>
          <p className="text-muted-foreground text-sm mt-1">Digite seus dados para continuar</p>
        </div>
  
        <Card className="bg-card border border-border rounded-lg shadow">
          <CardHeader className="pb-0">
            <CardTitle className="text-lg font-medium text-card-foreground">Acesse sua conta</CardTitle>
          </CardHeader>
  
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-5">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
                  <Input
                    type="email"
                    placeholder="Seu email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-11 h-12 bg-input border border-border text-foreground placeholder-muted-foreground rounded-md"
                    required
                  />
                </div>
  
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
                  <Input
                    type="password"
                    placeholder="Sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-11 h-12 bg-input border border-border text-foreground placeholder-muted-foreground rounded-md"
                    required
                  />
                </div>
  
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <label className="flex items-center gap-2">
                    <Checkbox className="border-border bg-input text-foreground" />
                    Lembrar-me
                  </label>
                  <Link href="/auth/forgot-password" className="hover:underline">
                    Esqueceu a senha?
                  </Link>
                </div>
              </div>
  
              <Button
                type="submit"
                className="w-full h-12 bg-primary text-primary-foreground hover:opacity-90 transition rounded-md"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>
          </CardContent>
  
          <CardFooter className="flex flex-col space-y-4 pt-0">
            <div className="relative w-full my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
                <span className="bg-card px-3">Não tem uma conta?</span>
              </div>
            </div>
  
            <Button
              variant="outline"
              className="w-full h-12 border-border text-foreground hover:bg-muted rounded-md"
              asChild
            >
              <Link href="/auth/register">Criar nova conta</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  </main>
  
  );
}