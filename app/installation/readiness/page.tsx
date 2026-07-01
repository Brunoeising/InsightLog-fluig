'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ClipboardCheck, CheckCircle2, XCircle, Download, AlertTriangle, Minus, Terminal, Monitor } from 'lucide-react';
import NavBar from '@/components/NavBar';
import { getCurrentUser } from '@/lib/supabase-client';
import { getChecklistItems, evaluateReadiness, generateReadinessScript, saveReadinessAssessment, ReadinessItem } from '@/lib/readiness-service';

export default function ReadinessPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [environmentName, setEnvironmentName] = useState('');
  const [fluigVersion, setFluigVersion] = useState('');
  const [items, setItems] = useState<ReadinessItem[]>([]);
  const [result, setResult] = useState<any>(null);
  const [aiRecommendations, setAiRecommendations] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser();
      if (!user) { router.push('/auth/login'); return; }
      setIsAuthenticated(true);
      setItems(getChecklistItems());
    };
    checkAuth();
  }, [router]);

  const updateItemStatus = (id: string, status: ReadinessItem['status']) => {
    setItems(prev => {
      const updated = prev.map(i => i.id === id ? { ...i, status } : i);
      setResult(evaluateReadiness(updated));
      return updated;
    });
  };

  const handleEvaluate = () => {
    const r = evaluateReadiness(items);
    setResult(r);
  };

  const handleDownloadScript = (os: 'linux' | 'windows') => {
    const script = generateReadinessScript(os);
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = os === 'linux' ? 'verificar-prontidao.sh' : 'verificar-prontidao.ps1';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAIRecommend = async () => {
    setIsAiLoading(true);
    try {
      const response = await fetch('/api/ai/readiness-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, fluigVersion, environmentName }),
      });
      if (response.ok) {
        const data = await response.json();
        setAiRecommendations(data.recommendations || '');
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const r = evaluateReadiness(items);
      await saveReadinessAssessment({
        environmentName,
        fluigVersion,
        items,
        result: r,
        aiRecommendations,
      });
      toast({ title: 'Salvo', description: 'Assessment salvo com sucesso' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthenticated) {
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main>;
  }

  const categories = [...new Set(items.map(i => i.category))];
  const currentResult = result || evaluateReadiness(items);

  const CircleProgress = ({ percentage }: { percentage: number }) => {
    const radius = 35;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    const getColor = () => {
      if (percentage >= 80) return '#10b981';
      if (percentage >= 60) return '#f59e0b';
      return '#ef4444';
    };

    return (
      <div className="flex items-center justify-center">
        <svg width="80" height="80" className="transform -rotate-90">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="2" className="text-border/30" />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={getColor()}
            strokeWidth="2"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-2xl font-bold">{percentage}%</span>
          <span className="text-xs text-muted-foreground">Prontidao</span>
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-background">
      <NavBar />
      <div className="max-w-5xl mx-auto pt-28 px-6 pb-12">
        {/* Page Header */}
        <div className="mb-10 animate-slide-up">
          <h1 className="text-2xl font-semibold text-foreground mb-2">Checklist Pre-Instalacao</h1>
          <p className="text-muted-foreground">Verifique se o ambiente esta pronto para receber o Fluig</p>
        </div>

        {/* Configuration Card */}
        <Card className="mb-8 border-border/60 rounded-xl animate-slide-up" style={{ animationDelay: '50ms' }}>
          <CardHeader>
            <CardTitle className="text-base">Configuracao</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Input
                placeholder="Nome do ambiente"
                value={environmentName}
                onChange={(e) => setEnvironmentName(e.target.value)}
                className="border-border/60 rounded-lg"
              />
              <Select value={fluigVersion} onValueChange={setFluigVersion}>
                <SelectTrigger className="border-border/60 rounded-lg">
                  <SelectValue placeholder="Versao do Fluig" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2.0">Fluig 2.0 (Voyager)</SelectItem>
                  <SelectItem value="1.8">Fluig 1.8.x</SelectItem>
                  <SelectItem value="1.7">Fluig 1.7.x (Lake)</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleDownloadScript('linux')}
                  className="flex-1 border-border/60 rounded-lg hover:bg-primary/5"
                >
                  <Terminal className="h-4 w-4 mr-2" /> Linux
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleDownloadScript('windows')}
                  className="flex-1 border-border/60 rounded-lg hover:bg-primary/5"
                >
                  <Monitor className="h-4 w-4 mr-2" /> Windows
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Score Card */}
        <Card className="mb-8 border-border/60 rounded-xl animate-slide-up" style={{ animationDelay: '100ms' }}>
          <CardHeader>
            <CardTitle className="text-base">Status Geral</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-8">
              <CircleProgress percentage={currentResult.score} />
              <div className="flex-1">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Status</p>
                    <Badge
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        currentResult.overallStatus === 'ready'
                          ? 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
                          : currentResult.overallStatus === 'partial'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                          : 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
                      }`}
                    >
                      {currentResult.overallStatus === 'ready'
                        ? 'Pronto'
                        : currentResult.overallStatus === 'partial'
                        ? 'Parcial'
                        : 'Nao Pronto'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Obrigatorios</p>
                    <p className="text-sm font-medium">{currentResult.mandatoryPassed || 0} de {currentResult.mandatoryTotal || 0}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Checklist */}
        <div className="animate-slide-up mb-8" style={{ animationDelay: '150ms' }}>
          <Accordion type="multiple" defaultValue={categories} className="space-y-3">
            {categories.map((cat, idx) => {
              const catItems = items.filter(i => i.category === cat);
              const catLabel = catItems[0]?.categoryLabel || cat;
              const passCount = catItems.filter(i => i.status === 'pass').length;
              return (
                <AccordionItem
                  key={cat}
                  value={cat}
                  className="border border-border/60 rounded-xl px-0 overflow-hidden"
                >
                  <AccordionTrigger className="hover:no-underline px-4 py-3 hover:bg-muted/50">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="font-medium text-sm">{catLabel}</span>
                      <Badge className="rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                        {passCount}/{catItems.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-0 py-4 pb-0">
                    <div className="space-y-3">
                      {catItems.map(item => (
                        <div key={item.id} className="px-4">
                          <div className="flex items-start gap-4 pb-3 border-b border-border/40 last:border-b-0">
                            <div className="flex gap-2 mt-1 shrink-0">
                              <button
                                onClick={() => updateItemStatus(item.id, 'pass')}
                                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                                  item.status === 'pass'
                                    ? 'bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30'
                                    : 'bg-muted hover:bg-muted/80 text-muted-foreground border border-border/40 hover:border-green-500/30'
                                }`}
                                title="Pass"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => updateItemStatus(item.id, 'fail')}
                                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                                  item.status === 'fail'
                                    ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30'
                                    : 'bg-muted hover:bg-muted/80 text-muted-foreground border border-border/40 hover:border-red-500/30'
                                }`}
                                title="Fail"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => updateItemStatus(item.id, 'na')}
                                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                                  item.status === 'na'
                                    ? 'bg-gray-500/20 text-gray-600 dark:text-gray-400 border border-gray-500/30'
                                    : 'bg-muted hover:bg-muted/80 text-muted-foreground border border-border/40 hover:border-gray-500/30'
                                }`}
                                title="Not Applicable"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium">{item.requirement}</span>
                                {item.isMandatory && (
                                  <Badge className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20">
                                    Obrigatorio
                                  </Badge>
                                )}
                              </div>
                              <code className="text-xs text-muted-foreground bg-muted/60 rounded px-2 py-1 inline-block font-mono break-words">
                                {item.validationHint}
                              </code>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>

        {/* Blockers */}
        {currentResult.blockers.length > 0 && (
          <Card
            className="mb-8 border-destructive/20 bg-destructive/5 rounded-xl animate-slide-up"
            style={{ animationDelay: '200ms' }}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive text-base">
                <AlertTriangle className="h-5 w-5" />
                Bloqueadores ({currentResult.blockers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {currentResult.blockers.map((b: string, i: number) => (
                  <li key={i} className="text-sm flex items-start gap-3">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-3 mb-8 animate-slide-up" style={{ animationDelay: '250ms' }}>
          <Button
            onClick={handleAIRecommend}
            disabled={isAiLoading}
            className="bg-primary hover:bg-primary/90 rounded-lg"
          >
            {isAiLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Recomendacoes IA
              </>
            )}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            variant="outline"
            className="border-border/60 rounded-lg hover:bg-muted/50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Salvar Assessment
          </Button>
        </div>

        {/* AI Recommendations */}
        {aiRecommendations && (
          <Card
            className="border-primary/20 rounded-xl animate-slide-up"
            style={{ animationDelay: '300ms' }}
          >
            <CardHeader>
              <CardTitle className="text-base">Recomendacoes da IA</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{aiRecommendations}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
