'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, CheckCircle2, Search, Wrench, ChevronLeft } from 'lucide-react';
import NavBar from '@/components/NavBar';
import { getCurrentUser } from '@/lib/supabase-client';
import { matchInstallationError, saveDiagnostic, markDiagnosticResolved, fetchDiagnosticHistory } from '@/lib/troubleshoot-service';

export default function TroubleshootPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [fluigVersion, setFluigVersion] = useState('');
  const [osType, setOsType] = useState('');
  const [dbType, setDbType] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [kbMatches, setKbMatches] = useState<any[]>([]);
  const [aiResult, setAiResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser();
      if (!user) { router.push('/auth/login'); return; }
      setIsAuthenticated(true);
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (isAuthenticated && showHistory) {
      fetchDiagnosticHistory(1, 20).then(r => setHistory(r.diagnostics)).catch(() => {});
    }
  }, [isAuthenticated, showHistory]);

  const handleAnalyze = async () => {
    if (!errorText.trim()) {
      toast({ title: 'Erro', description: 'Cole o texto do erro para analise', variant: 'destructive' });
      return;
    }

    setIsAnalyzing(true);
    setKbMatches([]);
    setAiResult(null);

    try {
      const localMatches = matchInstallationError(errorText, fluigVersion);
      setKbMatches(localMatches);

      const response = await fetch('/api/ai/troubleshoot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorText, fluigVersion, osType, dbType }),
      });

      if (response.ok) {
        const result = await response.json();
        setAiResult(result);

        await saveDiagnostic({
          environmentName: '',
          errorInput: errorText.substring(0, 2000),
          errorType: result.category || 'INSTALLATION',
          fluigVersion,
          aiDiagnosis: result.diagnosis || '',
          solutionSteps: result.solutionSteps || [],
          relatedArticles: result.relatedArticles || [],
        });
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isAuthenticated) {
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main>;
  }

  return (
    <main className="min-h-screen bg-background">
      <NavBar />
      <div className="max-w-6xl mx-auto pt-28 px-6 pb-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Diagnostico de Instalacao</h1>
            <p className="text-muted-foreground mt-1">Cole o erro e receba diagnostico automatico com solucoes baseadas no TDN</p>
          </div>
          <Button variant="outline" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Novo Diagnostico' : 'Historico'}
          </Button>
        </div>

        {showHistory ? (
          <div className="space-y-4">
            {history.length === 0 && <p className="text-muted-foreground">Nenhum diagnostico no historico.</p>}
            {history.map((d: any) => (
              <Card key={d.id} className="border-l-4" style={{ borderLeftColor: d.resolved ? '#22c55e' : '#f59e0b' }}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">{d.error_type}</Badge>
                        {d.resolved && <Badge className="bg-green-100 text-green-700">Resolvido</Badge>}
                        {d.fluig_version && <Badge variant="secondary">{d.fluig_version}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{d.error_input}</p>
                      {d.ai_diagnosis && <p className="text-sm mt-2">{d.ai_diagnosis}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input Panel */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5 text-[#245C90]" />
                    Descreva ou cole o erro
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Cole aqui o erro do server.log, mensagem de erro da tela de instalacao, ou descreva o problema..."
                    value={errorText}
                    onChange={(e) => setErrorText(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Select value={fluigVersion} onValueChange={setFluigVersion}>
                      <SelectTrigger><SelectValue placeholder="Versao Fluig" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2.0">Fluig 2.0 (Voyager)</SelectItem>
                        <SelectItem value="1.8">Fluig 1.8.x</SelectItem>
                        <SelectItem value="1.7">Fluig 1.7.x (Lake)</SelectItem>
                        <SelectItem value="1.6">Fluig 1.6.x</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={osType} onValueChange={setOsType}>
                      <SelectTrigger><SelectValue placeholder="Sistema Operacional" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rhel8">RHEL / CentOS 8.x</SelectItem>
                        <SelectItem value="rhel9">RHEL 9.x</SelectItem>
                        <SelectItem value="ubuntu22">Ubuntu 22.04</SelectItem>
                        <SelectItem value="windows2019">Windows Server 2019</SelectItem>
                        <SelectItem value="windows2022">Windows Server 2022</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={dbType} onValueChange={setDbType}>
                      <SelectTrigger><SelectValue placeholder="Banco de Dados" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sqlserver">SQL Server</SelectItem>
                        <SelectItem value="mysql">MySQL 8.0</SelectItem>
                        <SelectItem value="oracle">Oracle 19c</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAnalyze} disabled={isAnalyzing} className="w-full bg-[#245C90] hover:bg-[#1e4d7a]">
                    {isAnalyzing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analisando...</> : <><Wrench className="h-4 w-4 mr-2" />Diagnosticar</>}
                  </Button>
                </CardContent>
              </Card>

              {/* AI Result */}
              {aiResult && (
                <Card className="border-[#245C90]/30">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-[#245C90]" />
                      Diagnostico da IA
                      <Badge variant="outline" className={
                        aiResult.severity === 'critical' ? 'border-red-500 text-red-600' :
                        aiResult.severity === 'medium' ? 'border-amber-500 text-amber-600' :
                        'border-green-500 text-green-600'
                      }>{aiResult.severity}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                      <p className="text-sm font-medium mb-1">Diagnostico</p>
                      <p className="text-sm">{aiResult.diagnosis}</p>
                    </div>
                    {aiResult.rootCause && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                        <p className="text-sm font-medium">Causa Raiz: <span className="font-normal">{aiResult.rootCause}</span></p>
                      </div>
                    )}
                    {aiResult.solutionSteps?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Passos para Solucao:</p>
                        <ol className="list-decimal list-inside space-y-2">
                          {aiResult.solutionSteps.map((step: string, i: number) => (
                            <li key={i} className="text-sm">{step}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* KB Matches Sidebar */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Base de Conhecimento</CardTitle>
                </CardHeader>
                <CardContent>
                  {kbMatches.length === 0 && !isAnalyzing && (
                    <p className="text-sm text-muted-foreground">Os matches da base local aparecerao aqui apos a analise.</p>
                  )}
                  {kbMatches.map((match, i) => (
                    <div key={match.id} className="mb-4 p-3 border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-medium">{match.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{match.description}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          Confianca: {Math.round(match.confidence * 100)}%
                        </Badge>
                        <Badge variant="outline" className="text-xs">{match.severity}</Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
