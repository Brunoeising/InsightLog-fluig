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
import { Loader2, Globe, Plug, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Diagnostico de Integracoes</h1>
            <p className="text-muted-foreground mt-1">Diagnostique erros de webservices SOAP/REST e integracoes externas</p>
          </div>
          <Button variant="outline" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Novo Diagnostico' : 'Historico'}
          </Button>
        </div>

        {showHistory ? (
          <div className="space-y-4">
            {history.length === 0 && <p className="text-muted-foreground">Nenhum diagnostico no historico.</p>}
            {history.map((d: any) => (
              <Card key={d.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">{d.integration_type}</Badge>
                    {d.endpoint_url && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{d.endpoint_url}</span>}
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(d.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">{d.error_message}</p>
                  {d.ai_diagnosis && <p className="text-sm mt-1">{d.ai_diagnosis}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plug className="h-5 w-5 text-[#245C90]" />
                  Informacoes da Integracao
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Select value={integrationType} onValueChange={setIntegrationType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="REST">REST API</SelectItem>
                      <SelectItem value="SOAP">SOAP / WebService</SelectItem>
                      <SelectItem value="JDBC">JDBC / Banco Externo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="URL do endpoint (opcional)"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                  />
                </div>
                <Textarea
                  placeholder="Cole aqui a mensagem de erro, stack trace ou descricao do problema de integracao..."
                  value={errorMessage}
                  onChange={(e) => setErrorMessage(e.target.value)}
                  className="min-h-[180px] font-mono text-sm"
                />
                <Textarea
                  placeholder="Contexto adicional (opcional): qual acao estava sendo executada, se e dataset, evento, widget..."
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  className="min-h-[80px] text-sm"
                />
                <Button onClick={handleDiagnose} disabled={isAnalyzing} className="w-full bg-[#245C90] hover:bg-[#1e4d7a]">
                  {isAnalyzing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Diagnosticando...</> : <><Globe className="h-4 w-4 mr-2" />Diagnosticar</>}
                </Button>
              </CardContent>
            </Card>

            {/* Results */}
            <div className="space-y-4">
              {localDiagnosis && (
                <Card className="border-amber-200">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Match Local ({Math.round(localDiagnosis.confidence * 100)}% confianca)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="outline" className="mb-2">{localDiagnosis.type}</Badge>
                    <p className="text-sm">{localDiagnosis.diagnosis}</p>
                    <ol className="list-decimal list-inside mt-3 space-y-1">
                      {localDiagnosis.steps.map((s: string, i: number) => <li key={i} className="text-sm">{s}</li>)}
                    </ol>
                  </CardContent>
                </Card>
              )}

              {aiResult && (
                <Card className="border-[#245C90]/30">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-[#245C90]" />
                      Diagnostico Detalhado (IA)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                      <p className="text-sm">{aiResult.diagnosis}</p>
                    </div>
                    {aiResult.rootCause && (
                      <p className="text-sm"><span className="font-medium">Causa:</span> {aiResult.rootCause}</p>
                    )}
                    {aiResult.solutionSteps?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Solucao:</p>
                        <ol className="list-decimal list-inside space-y-1">
                          {aiResult.solutionSteps.map((s: string, i: number) => <li key={i} className="text-sm">{s}</li>)}
                        </ol>
                      </div>
                    )}
                    {aiResult.configSuggestion && (
                      <div>
                        <p className="text-sm font-medium mb-1">Configuracao Sugerida:</p>
                        <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap">{aiResult.configSuggestion}</pre>
                      </div>
                    )}
                    {aiResult.commonPitfalls?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-1">Armadilhas Comuns:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {aiResult.commonPitfalls.map((p: string, i: number) => <li key={i} className="text-xs text-muted-foreground">{p}</li>)}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {!localDiagnosis && !aiResult && !isAnalyzing && (
                <Card>
                  <CardContent className="flex items-center justify-center min-h-[200px]">
                    <p className="text-muted-foreground text-center">Preencha os dados e clique em &quot;Diagnosticar&quot; para receber a analise.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
