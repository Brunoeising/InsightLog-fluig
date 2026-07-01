'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileCode, Database, CheckCircle2, XCircle, AlertTriangle, Download } from 'lucide-react';
import NavBar from '@/components/NavBar';
import { getCurrentUser } from '@/lib/supabase-client';
import { parseStandaloneXml, validateDatabaseParams, getConfigScore, saveConfigValidation, ConfigParam } from '@/lib/config-validator-service';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  ok: <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />,
  error: <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />,
  not_found: <span className="h-5 w-5 text-gray-400 flex-shrink-0 flex items-center justify-center">--</span>,
};

export default function ConfigurationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('standalone');
  const [configContent, setConfigContent] = useState('');
  const [dbType, setDbType] = useState('mysql');
  const [dbParams, setDbParams] = useState('');
  const [validationResults, setValidationResults] = useState<ConfigParam[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [aiCorrections, setAiCorrections] = useState('');
  const [correctedContent, setCorrectedContent] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser();
      if (!user) { router.push('/auth/login'); return; }
      setIsAuthenticated(true);
    };
    checkAuth();
  }, [router]);

  const handleValidateStandalone = () => {
    if (!configContent.trim()) {
      toast({ title: 'Erro', description: 'Cole o conteudo do standalone.xml', variant: 'destructive' });
      return;
    }
    const results = parseStandaloneXml(configContent);
    setValidationResults(results);
    setScore(getConfigScore(results));
  };

  const handleValidateDbParams = () => {
    if (!dbParams.trim()) {
      toast({ title: 'Erro', description: 'Cole os parametros do banco', variant: 'destructive' });
      return;
    }
    const params: Record<string, string> = {};
    dbParams.split('\n').forEach(line => {
      const parts = line.split(/[=:|]\s*/);
      if (parts.length >= 2) {
        params[parts[0].trim().toLowerCase()] = parts[1].trim();
      }
    });
    const results = validateDatabaseParams(params, dbType);
    setValidationResults(results);
    setScore(getConfigScore(results));
  };

  const handleAIFix = async () => {
    setIsFixing(true);
    try {
      const response = await fetch('/api/ai/config-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configContent: activeTab === 'standalone' ? configContent : dbParams,
          configType: activeTab === 'standalone' ? 'standalone.xml' : `database-${dbType}`,
          validationResults,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setAiCorrections(result.corrections || '');
        setCorrectedContent(result.correctedContent || '');

        await saveConfigValidation({
          environmentName: '',
          configType: activeTab === 'standalone' ? 'standalone.xml' : `database-${dbType}`,
          configContent: activeTab === 'standalone' ? configContent : dbParams,
          validationResults,
          aiCorrections: result.corrections,
          correctedContent: result.correctedContent,
          score: score || 0,
        });
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsFixing(false);
    }
  };

  const handleDownload = () => {
    if (!correctedContent) return;
    const blob = new Blob([correctedContent], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeTab === 'standalone' ? 'standalone-corrigido.xml' : `db-params-${dbType}-corrigido.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAuthenticated) {
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main>;
  }

  return (
    <main className="min-h-screen bg-background">
      <NavBar />
      <div className="animate-slide-up max-w-6xl mx-auto pt-28 px-6 pb-12">
        <div className="mb-12">
          <h1 className="text-2xl font-semibold text-foreground">Validador de Configuracao</h1>
          <p className="text-muted-foreground mt-2 text-sm">Valide standalone.xml e parametros de banco contra as boas praticas do TDN</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="rounded-full bg-muted p-1 mb-8 inline-flex">
            <TabsTrigger value="standalone" className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm flex items-center gap-2">
              <FileCode className="h-4 w-4" /> standalone.xml
            </TabsTrigger>
            <TabsTrigger value="database" className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm flex items-center gap-2">
              <Database className="h-4 w-4" /> Parametros de Banco
            </TabsTrigger>
          </TabsList>

          <TabsContent value="standalone">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>Conteudo do standalone.xml</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Cole aqui o conteudo do standalone.xml (ou trecho relevante com datasources, timeouts, etc.)..."
                    value={configContent}
                    onChange={(e) => setConfigContent(e.target.value)}
                    className="bg-muted/30 border rounded-xl font-mono text-xs min-h-[300px]"
                  />
                  <Button onClick={handleValidateStandalone} className="w-full bg-primary hover:bg-primary/90">
                    <FileCode className="h-4 w-4 mr-2" /> Validar Parametros
                  </Button>
                </CardContent>
              </Card>
              <ResultsPanel
                results={validationResults}
                score={score}
                isFixing={isFixing}
                onFix={handleAIFix}
                aiCorrections={aiCorrections}
                correctedContent={correctedContent}
                onDownload={handleDownload}
              />
            </div>
          </TabsContent>

          <TabsContent value="database">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>Parametros do Banco de Dados</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Select value={dbType} onValueChange={setDbType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mysql">MySQL 8.0</SelectItem>
                      <SelectItem value="oracle">Oracle 19c</SelectItem>
                      <SelectItem value="sqlserver">SQL Server</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    placeholder={`Cole aqui a saida de:\n${dbType === 'mysql' ? 'SHOW VARIABLES;' : dbType === 'oracle' ? 'SELECT name, value FROM v$parameter;' : 'sp_configure;'}\n\nFormato aceito: parametro = valor (um por linha)`}
                    value={dbParams}
                    onChange={(e) => setDbParams(e.target.value)}
                    className="bg-muted/30 border rounded-xl font-mono text-xs min-h-[300px]"
                  />
                  <Button onClick={handleValidateDbParams} className="w-full bg-primary hover:bg-primary/90">
                    <Database className="h-4 w-4 mr-2" /> Validar Parametros
                  </Button>
                </CardContent>
              </Card>
              <ResultsPanel
                results={validationResults}
                score={score}
                isFixing={isFixing}
                onFix={handleAIFix}
                aiCorrections={aiCorrections}
                correctedContent={correctedContent}
                onDownload={handleDownload}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function ResultsPanel({ results, score, isFixing, onFix, aiCorrections, correctedContent, onDownload }: {
  results: ConfigParam[];
  score: number | null;
  isFixing: boolean;
  onFix: () => void;
  aiCorrections: string;
  correctedContent: string;
  onDownload: () => void;
}) {
  if (results.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex items-center justify-center min-h-[300px]">
          <p className="text-muted-foreground text-center text-sm">Os resultados da validacao aparecerao aqui apos clicar em &quot;Validar&quot;.</p>
        </CardContent>
      </Card>
    );
  }

  const criticalErrors = results.filter(r => r.critical && r.status === 'error');
  const warnings = results.filter(r => r.status === 'warning');

  return (
    <div className="space-y-4">
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-lg">Resultado da Validacao</CardTitle>
            {score !== null && (
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                  <span className="text-sm font-semibold text-primary">{score}%</span>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {score !== null && <Progress value={score} className="h-2" />}
          {criticalErrors.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30">
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-400 font-medium">{criticalErrors.length} erro(s) critico(s) encontrado(s)</p>
            </div>
          )}
          <div className="max-h-[300px] overflow-y-auto space-y-3 pr-2">
            {results.map((param) => (
              <div key={param.id} className="flex items-start gap-3 p-3 rounded-xl border border-border/60 bg-card/50 hover:bg-card/70 transition-colors">
                <div className="pt-0.5">
                  {STATUS_ICONS[param.status]}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="font-medium text-sm text-foreground">{param.label}</div>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <div className="flex gap-2">
                      <span>Atual:</span>
                      <code className="bg-muted/60 px-2 py-0.5 rounded font-mono text-foreground/70">{param.currentValue || 'N/A'}</code>
                    </div>
                    <div className="flex gap-2">
                      <span>Esperado:</span>
                      <code className="bg-muted/60 px-2 py-0.5 rounded font-mono text-foreground/70">{param.expectedValue}</code>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button onClick={onFix} disabled={isFixing} variant="outline" className="w-full mt-2">
            {isFixing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando correcoes...</> : 'Corrigir com IA'}
          </Button>
        </CardContent>
      </Card>

      {aiCorrections && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Correcoes da IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/30 rounded-xl p-4 border border-muted text-sm text-foreground/80 font-mono text-xs max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words">
              {aiCorrections}
            </div>
            {correctedContent && (
              <Button onClick={onDownload} variant="secondary" className="w-full">
                <Download className="h-4 w-4 mr-2" /> Baixar Configuracao Corrigida
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
