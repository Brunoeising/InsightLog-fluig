'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Shield, Calendar, Activity } from 'lucide-react';
import NavBar from '@/components/NavBar';
import { getCurrentUser, supabase } from '@/lib/supabase-client';
import { AuditLogEntry } from '@/lib/types';

export default function AuditPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser();
      if (!user) { router.push('/auth/login'); return; }
      setIsAuthenticated(true);
    };
    checkAuth();
  }, [router]);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs((data || []).map((l: any) => ({
        id: l.id,
        userId: l.user_id,
        action: l.action,
        environmentName: l.environment_name,
        resultSummary: l.result_summary,
        createdAt: l.created_at,
      })));
    } catch (err) {
      console.error('Erro ao carregar auditoria:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { if (isAuthenticated) loadLogs(); }, [isAuthenticated, loadLogs]);

  if (!isAuthenticated || isLoading) {
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main>;
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-secondary/10 text-foreground">
      <NavBar />
      <div className="max-w-4xl mx-auto pt-24 px-6 md:px-10 pb-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" /> Log de Auditoria
          </h1>
          <p className="text-muted-foreground">Registro de todas as execucoes de analise.</p>
        </div>

        {logs.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">Nenhum registro de auditoria encontrado.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Registros Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Activity className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{log.environmentName || 'N/A'}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(log.createdAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{log.resultSummary}</p>
                      <Badge variant="outline" className="mt-2 text-xs">{log.action}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
