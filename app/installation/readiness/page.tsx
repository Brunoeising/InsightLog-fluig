'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ClipboardCheck, CheckCircle2, XCircle, Download, AlertTriangle, Minus } from 'lucide-react';
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

  return (
    <main className="min-h-screen bg-background">
      <NavBar />
      <div className="max-w-5xl mx-auto pt-28 px-6 pb-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Checklist Pre-Instalacao</h1>
          <p className="text-muted-foreground mt-1">Verifique se o ambiente esta pronto para receber o Fluig</p>
        </div>

        {/* Header Info */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <Input placeholder="Nome do ambiente" value={environmentName} onChange={(e) => setEnvironmentName(e.target.value)} />
              <Select value={fluigVersion} onValueChange={setFluigVersion}>
                <SelectTrigger><SelectValue placeholder="Versao do Fluig" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2.0">Fluig 2.0 (Voyager)</SelectItem>
                  <SelectItem value="1.8">Fluig 1.8.x</SelectItem>
                  <SelectItem value="1.7">Fluig 1.7.x (Lake)</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleDownloadScript('linux')} className="flex-1">
                  <Download className="h-4 w-4 mr-1" /> Linux
                </Button>
                <Button variant="outline" onClick={() => handleDownloadScript('windows')} className="flex-1">
                  <Download className="h-4 w-4 mr-1" /> Windows
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Prontidao</span>
                  <span className="text-sm font-bold">{currentResult.score}%</span>
                </div>
                <Progress value={currentResult.score} className="h-3" />
              </div>
              <Badge className={
                currentResult.overallStatus === 'ready' ? 'bg-green-100 text-green-700' :
                currentResult.overallStatus === 'partial' ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              }>
                {currentResult.overallStatus === 'ready' ? 'Pronto' : currentResult.overallStatus === 'partial' ? 'Parcial' : 'Nao Pronto'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Checklist */}
        <Accordion type="multiple" defaultValue={categories} className="space-y-4">
          {categories.map(cat => {
            const catItems = items.filter(i => i.category === cat);
            const catLabel = catItems[0]?.categoryLabel || cat;
            const passCount = catItems.filter(i => i.status === 'pass').length;
            return (
              <AccordionItem key={cat} value={cat} className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{catLabel}</span>
                    <Badge variant="outline" className="text-xs">{passCount}/{catItems.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pb-2">
                    {catItems.map(item => (
                      <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                        <div className="flex gap-1 mt-0.5">
                          <button
                            onClick={() => updateItemStatus(item.id, 'pass')}
                            className={`p-1 rounded ${item.status === 'pass' ? 'bg-green-100' : 'hover:bg-green-50'}`}
                          >
                            <CheckCircle2 className={`h-4 w-4 ${item.status === 'pass' ? 'text-green-600' : 'text-gray-300'}`} />
                          </button>
                          <button
                            onClick={() => updateItemStatus(item.id, 'fail')}
                            className={`p-1 rounded ${item.status === 'fail' ? 'bg-red-100' : 'hover:bg-red-50'}`}
                          >
                            <XCircle className={`h-4 w-4 ${item.status === 'fail' ? 'text-red-600' : 'text-gray-300'}`} />
                          </button>
                          <button
                            onClick={() => updateItemStatus(item.id, 'na')}
                            className={`p-1 rounded ${item.status === 'na' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                          >
                            <Minus className={`h-4 w-4 ${item.status === 'na' ? 'text-gray-600' : 'text-gray-300'}`} />
                          </button>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{item.requirement}</span>
                            {item.isMandatory && <Badge variant="destructive" className="text-[10px] h-4">Obrigatorio</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 font-mono">{item.validationHint}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {/* Blockers */}
        {currentResult.blockers.length > 0 && (
          <Card className="mt-6 border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Bloqueadores ({currentResult.blockers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {currentResult.blockers.map((b: string, i: number) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <Button onClick={handleAIRecommend} disabled={isAiLoading} className="bg-[#245C90] hover:bg-[#1e4d7a]">
            {isAiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analisando...</> : <><ClipboardCheck className="h-4 w-4 mr-2" />Recomendacoes IA</>}
          </Button>
          <Button onClick={handleSave} disabled={isSaving} variant="outline">
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Salvar Assessment
          </Button>
        </div>

        {/* AI Recommendations */}
        {aiRecommendations && (
          <Card className="mt-6 border-[#245C90]/30">
            <CardHeader><CardTitle className="text-base">Recomendacoes da IA</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{aiRecommendations}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
