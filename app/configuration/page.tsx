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
  ok: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  error: <XCircle className="h-4 w-4 text-red-500" />,
  not_found: <span className="h-4 w-4 text-gray-400">--</span>,
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
      <div className="max-w-6xl mx-auto pt-28 px-6 pb-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Validador de Configuracao</h1>
          <p className="text-muted-foreground mt-1">Valide standalone.xml e parametros de banco contra as boas praticas do TDN</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="standalone" className="flex items-center gap-2">
              <FileCode className="h-4 w-4" /> standalone.xml
            </TabsTrigger>
            <TabsTrigger value="database" className="flex items-center gap-2">
              <Database className="h-4 w-4" /> Parametros de Banco
            </TabsTrigger>
          </TabsList>

          <TabsContent value="standalone">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>Conteudo do standalone.xml</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Cole aqui o conteudo do standalone.xml (ou trecho relevante com datasources, timeouts, etc.)..."
                    value={configContent}
                    onChange={(e) => setConfigContent(e.target.value)}
                    className="min-h-[300px] font-mono text-xs"
                  />
                  <Button onClick={handleValidateStandalone} className="w-full bg-[#245C90] hover:bg-[#1e4d7a]">
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
              <Card>
                <CardHeader><CardTitle>Parametros do Banco de Dados</CardTitle></CardHeader>
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
                    className="min-h-[300px] font-mono text-xs"
                  />
                  <Button onClick={handleValidateDbParams} className="w-full bg-[#245C90] hover:bg-[#1e4d7a]">
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
      <Card>
        <CardContent className="flex items-center justify-center min-h-[300px]">
          <p className="text-muted-foreground text-center">Os resultados da validacao aparecerao aqui apos clicar em &quot;Validar&quot;.</p>
        </CardContent>
      </Card>
    );
  }

  const criticalErrors = results.filter(r => r.critical && r.status === 'error');
  const warnings = results.filter(r => r.status === 'warning');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Resultado da Validacao</CardTitle>
            {score !== null && (
              <Badge className={score >= 80 ? 'bg-green-100 text-green-700' : score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}>
                Score: {score}%
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {score !== null && <Progress value={score} className="h-2" />}
          {criticalErrors.length > 0 && (
            <p className="text-sm text-red-600 font-medium">{criticalErrors.length} erro(s) critico(s) encontrado(s)</p>
          )}
          <div className="max-h-[250px] overflow-y-auto space-y-2">
            {results.map((param) => (
              <div key={param.id} className="flex items-start gap-2 p-2 rounded border text-sm">
                {STATUS_ICONS[param.status]}
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{param.label}</span>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>Atual: <code className="bg-muted px-1">{param.currentValue || 'N/A'}</code></span>
                    <span>Esperado: <code className="bg-muted px-1">{param.expectedValue}</code></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button onClick={onFix} disabled={isFixing} variant="outline" className="w-full">
            {isFixing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando correcoes...</> : 'Corrigir com IA'}
          </Button>
        </CardContent>
      </Card>

      {aiCorrections && (
        <Card className="border-[#245C90]/30">
          <CardHeader><CardTitle className="text-base">Correcoes da IA</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm whitespace-pre-wrap">{aiCorrections}</p>
            {correctedContent && (
              <Button onClick={onDownload} variant="outline" className="w-full">
                <Download className="h-4 w-4 mr-2" /> Baixar Configuracao Corrigida
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
