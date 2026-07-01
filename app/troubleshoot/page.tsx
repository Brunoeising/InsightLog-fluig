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
      <div className="max-w-6xl mx-auto pt-20 px-6 pb-12">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Diagnostico de Instalacao</h1>
            <p className="text-sm text-muted-foreground mt-2">Analise erros e receba solucoes baseadas em conhecimento</p>
          </div>
          <Button
            variant={showHistory ? 'default' : 'outline'}
            onClick={() => setShowHistory(!showHistory)}
            className="gap-2"
          >
            {showHistory ? (
              <>
                <ChevronLeft className="h-4 w-4" />
                Novo Diagnostico
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Historico
              </>
            )}
          </Button>
        </div>

        {showHistory ? (
          <div className="animate-slide-up space-y-3">
            {history.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Nenhum diagnostico no historico.</p>
              </div>
            )}
            {history.map((d: any) => (
              <Card
                key={d.id}
                className="border-border/60 hover:shadow-soft transition-shadow cursor-pointer"
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">{d.error_type}</Badge>
                        {d.resolved && (
                          <Badge className="bg-primary/10 text-primary text-xs">Resolvido</Badge>
                        )}
                        {d.fluig_version && (
                          <Badge variant="outline" className="text-xs">{d.fluig_version}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{d.error_input}</p>
                      {d.ai_diagnosis && (
                        <p className="text-sm text-foreground mt-2 line-clamp-2">{d.ai_diagnosis}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(d.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="animate-slide-up grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input Panel */}
            <div className="lg:col-span-2 space-y-6">
              {/* Error Input Card */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Search className="h-4 w-4 text-primary" />
                    </div>
                    Descreva ou cole o erro
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Code Editor Style Textarea */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-2 block">
                      Mensagem de Erro
                    </label>
                    <Textarea
                      placeholder="Cole aqui o erro do server.log, mensagem de erro da tela de instalacao, ou descreva o problema..."
                      value={errorText}
                      onChange={(e) => setErrorText(e.target.value)}
                      className="min-h-[180px] bg-muted/50 border rounded-xl font-mono text-sm resize-none"
                    />
                  </div>

                  {/* Configuration Selects */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">
                        Versao Fluig
                      </label>
                      <Select value={fluigVersion} onValueChange={setFluigVersion}>
                        <SelectTrigger className="rounded-lg"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2.0">Fluig 2.0 (Voyager)</SelectItem>
                          <SelectItem value="1.8">Fluig 1.8.x</SelectItem>
                          <SelectItem value="1.7">Fluig 1.7.x (Lake)</SelectItem>
                          <SelectItem value="1.6">Fluig 1.6.x</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">
                        Sistema Operacional
                      </label>
                      <Select value={osType} onValueChange={setOsType}>
                        <SelectTrigger className="rounded-lg"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rhel8">RHEL / CentOS 8.x</SelectItem>
                          <SelectItem value="rhel9">RHEL 9.x</SelectItem>
                          <SelectItem value="ubuntu22">Ubuntu 22.04</SelectItem>
                          <SelectItem value="windows2019">Windows Server 2019</SelectItem>
                          <SelectItem value="windows2022">Windows Server 2022</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">
                        Banco de Dados
                      </label>
                      <Select value={dbType} onValueChange={setDbType}>
                        <SelectTrigger className="rounded-lg"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sqlserver">SQL Server</SelectItem>
                          <SelectItem value="mysql">MySQL 8.0</SelectItem>
                          <SelectItem value="oracle">Oracle 19c</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Analyze Button */}
                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="w-full bg-primary hover:bg-primary/90 rounded-lg"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analisando...
                      </>
                    ) : (
                      <>
                        <Wrench className="h-4 w-4 mr-2" />
                        Diagnosticar
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* AI Result */}
              {aiResult && (
                <Card className="border-border/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        </div>
                        Resultado da Analise
                      </CardTitle>
                      <Badge
                        className={
                          aiResult.severity === 'critical'
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : aiResult.severity === 'medium'
                            ? 'bg-amber-100 text-amber-700 border-amber-200'
                            : 'bg-green-100 text-green-700 border-green-200'
                        }
                      >
                        {aiResult.severity}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Diagnosis Section */}
                    <div className="p-4 bg-primary/5 rounded-xl border border-border/40">
                      <p className="text-xs font-semibold text-primary mb-2">DIAGNOSTICO</p>
                      <p className="text-sm text-foreground">{aiResult.diagnosis}</p>
                    </div>

                    {/* Root Cause */}
                    {aiResult.rootCause && (
                      <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-border/40">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                          CAUSA RAIZ
                        </p>
                        <p className="text-sm text-foreground">{aiResult.rootCause}</p>
                      </div>
                    )}

                    {/* Solution Steps */}
                    {aiResult.solutionSteps?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                          Passos para Solucao
                        </p>
                        <div className="space-y-2">
                          {aiResult.solutionSteps.map((step: string, i: number) => (
                            <div key={i} className="flex gap-3">
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-semibold text-primary">{i + 1}</span>
                              </div>
                              <p className="text-sm text-foreground pt-0.5">{step}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* KB Matches Sidebar */}
            <div className="space-y-6">
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold">Base de Conhecimento</CardTitle>
                </CardHeader>
                <CardContent>
                  {kbMatches.length === 0 && !isAnalyzing && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Os matches da base local aparecerao aqui.
                    </p>
                  )}
                  {isAnalyzing && kbMatches.length === 0 && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <div className="space-y-2">
                    {kbMatches.map((match) => (
                      <div
                        key={match.id}
                        className="p-3 border border-border/40 rounded-lg hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start gap-2 mb-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <span className="text-xs font-medium text-foreground line-clamp-2">
                            {match.title}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                          {match.description}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="secondary" className="text-xs py-0.5">
                            {Math.round(match.confidence * 100)}%
                          </Badge>
                          <Badge variant="outline" className="text-xs py-0.5">
                            {match.severity}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
