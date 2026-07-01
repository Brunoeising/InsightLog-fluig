'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Globe, Plug, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import NavBar from '@/components/NavBar';
import { getCurrentUser } from '@/lib/supabase-client';
import { diagnoseIntegrationError, saveIntegrationDiagnostic, fetchIntegrationHistory } from '@/lib/integration-diagnostic-service';

export default function IntegrationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [integrationType, setIntegrationType] = useState('REST');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [localDiagnosis, setLocalDiagnosis] = useState<any>(null);
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
      fetchIntegrationHistory(1, 20).then(r => setHistory(r.diagnostics)).catch(() => {});
    }
  }, [isAuthenticated, showHistory]);

  const handleDiagnose = async () => {
    if (!errorMessage.trim()) {
      toast({ title: 'Erro', description: 'Informe a mensagem de erro', variant: 'destructive' });
      return;
    }

    setIsAnalyzing(true);
    setLocalDiagnosis(null);
    setAiResult(null);

    try {
      const local = diagnoseIntegrationError(errorMessage);
      setLocalDiagnosis(local);

      const response = await fetch('/api/ai/integration-diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorMessage, integrationType, endpointUrl, additionalContext }),
      });

      if (response.ok) {
        const result = await response.json();
        setAiResult(result);

        await saveIntegrationDiagnostic({
          environmentName: '',
          integrationType,
          endpointUrl,
          errorMessage: errorMessage.substring(0, 2000),
          aiDiagnosis: result.diagnosis || '',
          solutionSteps: result.solutionSteps || [],
          configSuggestion: result.configSuggestion || '',
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
        <div className="flex items-center justify-between mb-12 animate-slide-up">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Diagnostico de Integracoes</h1>
            <p className="text-muted-foreground mt-2">Diagnostique erros de webservices SOAP/REST e integracoes externas</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Novo Diagnostico' : 'Historico'}
          </Button>
        </div>

        {showHistory ? (
          <div className="animate-slide-up space-y-3">
            {history.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12">
                <Clock className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground text-center">Nenhum diagnostico no historico.</p>
              </div>
            )}
            {history.map((d: any) => (
              <Card key={d.id} className="border-border/60 rounded-xl shadow-soft hover:shadow-soft transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Badge variant="secondary" className="mt-0.5 flex-shrink-0">{d.integration_type}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-muted-foreground line-clamp-1">{d.error_message}</p>
                        {d.endpoint_url && <span className="text-xs text-muted-foreground truncate block mt-1">{d.endpoint_url}</span>}
                        {d.ai_diagnosis && <p className="text-sm mt-2 line-clamp-2">{d.ai_diagnosis}</p>}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">{new Date(d.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-up">
            {/* Input Card */}
            <Card className="border-border/60 rounded-xl shadow-soft">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Plug className="h-5 w-5 text-primary" />
                  Informacoes da Integracao
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">Tipo de Integracao</label>
                    <Select value={integrationType} onValueChange={setIntegrationType}>
                      <SelectTrigger className="rounded-xl border-border/60"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="REST">REST API</SelectItem>
                        <SelectItem value="SOAP">SOAP / WebService</SelectItem>
                        <SelectItem value="JDBC">JDBC / Banco Externo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">URL do Endpoint</label>
                    <Input
                      placeholder="https://api.example.com/endpoint (opcional)"
                      value={endpointUrl}
                      onChange={(e) => setEndpointUrl(e.target.value)}
                      className="rounded-xl border-border/60"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">Mensagem de Erro</label>
                  <Textarea
                    placeholder="Cole aqui a mensagem de erro, stack trace ou descricao do problema de integracao..."
                    value={errorMessage}
                    onChange={(e) => setErrorMessage(e.target.value)}
                    className="min-h-[180px] bg-muted/30 border-border/60 rounded-xl font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">Contexto Adicional</label>
                  <Textarea
                    placeholder="Qual acao estava sendo executada? E um dataset, evento, widget? (opcional)"
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                    className="min-h-[80px] bg-muted/30 border-border/60 rounded-xl font-mono text-sm"
                  />
                </div>

                <Button onClick={handleDiagnose} disabled={isAnalyzing} className="w-full bg-primary hover:bg-primary/90 rounded-xl">
                  {isAnalyzing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Diagnosticando...</> : <><Globe className="h-4 w-4 mr-2" />Diagnosticar</>}
                </Button>
              </CardContent>
            </Card>

            {/* Results */}
            <div className="space-y-4">
              {localDiagnosis && (
                <Card className="border-warning/30 rounded-xl shadow-soft">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-warning" />
                      Match Local ({Math.round(localDiagnosis.confidence * 100)}% confianca)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Badge variant="secondary" className="w-fit">{localDiagnosis.type}</Badge>
                    <p className="text-sm leading-relaxed">{localDiagnosis.diagnosis}</p>
                    <div className="space-y-2 mt-3">
                      {localDiagnosis.steps.map((s: string, i: number) => (
                        <div key={i} className="flex gap-3">
                          <div className="flex items-center justify-center h-6 w-6 rounded-full bg-warning/10 text-warning text-xs font-medium flex-shrink-0">
                            {i + 1}
                          </div>
                          <p className="text-sm leading-relaxed pt-0.5">{s}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {aiResult && (
                <Card className="border-primary/20 rounded-xl shadow-soft">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      Diagnostico Detalhado (IA)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-3 bg-primary/10 rounded-xl">
                      <p className="text-sm leading-relaxed">{aiResult.diagnosis}</p>
                    </div>

                    {aiResult.rootCause && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">Causa Raiz</p>
                        <p className="text-sm leading-relaxed">{aiResult.rootCause}</p>
                      </div>
                    )}

                    {aiResult.solutionSteps?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">Etapas da Solucao</p>
                        <div className="space-y-2">
                          {aiResult.solutionSteps.map((s: string, i: number) => (
                            <div key={i} className="flex gap-3">
                              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex-shrink-0">
                                {i + 1}
                              </div>
                              <p className="text-sm leading-relaxed pt-0.5">{s}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {aiResult.configSuggestion && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">Configuracao Sugerida</p>
                        <pre className="text-xs bg-muted/30 p-3 rounded-xl overflow-x-auto whitespace-pre-wrap border border-border/60 font-mono leading-relaxed">{aiResult.configSuggestion}</pre>
                      </div>
                    )}

                    {aiResult.commonPitfalls?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">Armadilhas Comuns</p>
                        <ul className="space-y-2">
                          {aiResult.commonPitfalls.map((p: string, i: number) => (
                            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                              <span className="text-primary mt-1">•</span>
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {!localDiagnosis && !aiResult && !isAnalyzing && (
                <div className="flex flex-col items-center justify-center min-h-[300px] rounded-xl border border-border/60 bg-muted/30">
                  <Globe className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-center text-sm">Preencha os dados e clique em Diagnosticar para receber a analise.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
