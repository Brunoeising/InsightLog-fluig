"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase-client';
import { Loader2, Mail, Lock, UserPlus } from 'lucide-react';
import { useState } from 'react';

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (password !== confirmPassword) {
        throw new Error('As senhas não coincidem');
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      toast({
        title: "Conta criada com sucesso",
        description: "Verifique seu e-mail.",
      });

      await new Promise(resolve => setTimeout(resolve, 500));
      router.replace('/');
      
    } catch (error: any) {
      toast({
        title: "Erro no cadastro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-background text-foreground">
    {/* LADO ESQUERDO - IMAGEM OU ILUSTRAÇÃO */}
    <div className="hidden md:flex items-center justify-center bg-muted">
      {/* Substitua por sua imagem ou componente de imagem */}
      <img
        src="/cadastro.svg"
        alt="Ilustração de cadastro"
        className="w-3/4 max-w-md object-contain"
      />
    </div>
  
    {/* LADO DIREITO - FORMULÁRIO DE REGISTRO */}
    <div className="flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Criar nova conta</h1>
          <p className="text-muted-foreground">
            Cadastre-se para começar a analisar seus logs
          </p>
        </div>
  
        <Card className="bg-card border border-border text-card-foreground shadow rounded-lg">
          <CardHeader>
            <CardTitle>Cadastro</CardTitle>
            <CardDescription>
              Preencha os dados abaixo para criar sua conta
            </CardDescription>
          </CardHeader>
  
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Seu email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 h-12 bg-input border border-border text-foreground placeholder-muted-foreground"
                  required
                />
              </div>
  
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 h-12 bg-input border border-border text-foreground placeholder-muted-foreground"
                  required
                />
              </div>
  
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Confirme sua senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-9 h-12 bg-input border border-border text-foreground placeholder-muted-foreground"
                  required
                />
              </div>
  
              <Button
                type="submit"
                className="w-full h-12 bg-primary text-primary-foreground hover:opacity-90 transition rounded-md"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando conta...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Criar conta
                  </>
                )}
              </Button>
            </form>
          </CardContent>
  
          <CardFooter className="flex flex-col space-y-4">
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
                <span className="bg-card px-2">ou</span>
              </div>
            </div>
  
            <Button
              variant="outline"
              className="w-full h-12 border-border text-foreground hover:bg-muted rounded-md"
              asChild
            >
              <Link href="/auth/login">Já tenho uma conta</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  </main>
  
  );
}