'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Loader2, Printer, FileDown } from 'lucide-react';
import NavBar from '@/components/NavBar';
import { getCurrentUser } from '@/lib/supabase-client';
import { fetchEnvironmentAnalysis } from '@/lib/environment-service';
import { EnvironmentAnalysis, CompatibilityStatus } from '@/lib/types';

const STATUS_LABELS: Record<CompatibilityStatus, string> = {
  HOMOLOGADO: 'Homologado',
  HOMOLOGADO_RESTRICOES: 'Homologado com Restricoes',
  EM_VALIDACAO: 'Em Validacao',
  NAO_HOMOLOGADO: 'Nao Homologado',
  NAO_IDENTIFICADO: 'Nao Identificado',
};

const STATUS_COLORS: Record<CompatibilityStatus, string> = {
  HOMOLOGADO: '#22c55e',
  HOMOLOGADO_RESTRICOES: '#f59e0b',
  EM_VALIDACAO: '#3b82f6',
  NAO_HOMOLOGADO: '#ef4444',
  NAO_IDENTIFICADO: '#94a3b8',
};

export default function ReportPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [analysis, setAnalysis] = useState<EnvironmentAnalysis | null>(null);

  const analysisId = params.id as string;
  const format = searchParams.get('format') || 'html';

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser();
      if (!user) { router.push('/auth/login'); return; }
      setIsAuthenticated(true);
    };
    checkAuth();
  }, [router]);

  const loadAnalysis = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchEnvironmentAnalysis(analysisId);
      if (!data) { router.push('/environment/history'); return; }
      setAnalysis(data);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [analysisId, router, toast]);

  useEffect(() => { if (isAuthenticated) loadAnalysis(); }, [isAuthenticated, loadAnalysis]);

  if (!isAuthenticated || isLoading) {
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main>;
  }
  if (!analysis) return null;

  const itemsByCategory = analysis.items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof analysis.items>);

  return (
    <main className="min-h-screen bg-white text-gray-900">
      {/* Action bar (not printed) */}
      <div className="fixed top-0 left-0 right-0 bg-white border-b z-50 px-6 py-3 print:hidden">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Button variant="ghost" onClick={() => router.push(`/environment/${analysisId}`)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir / PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Report content */}
      <div className="max-w-5xl mx-auto pt-20 px-6 md:px-10 pb-12 print:pt-0">
        {/* Header */}
        <div className="border-b pb-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-[#245C90]">InsightLog - Relatorio Tecnico de Ambiente</h1>
              <p className="text-sm text-gray-500 mt-1">Analise de Conformidade e Dimensionamento Fluig</p>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>Data: {new Date().toLocaleDateString('pt-BR')}</p>
              <p>Ambiente: {analysis.environmentName}</p>
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4 text-[#245C90]">1. Resumo Executivo</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-gray-500">Compatibilidade Geral</div>
              <div className="text-2xl font-bold">{analysis.compatibilityScore}%</div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-gray-500">Riscos</div>
              <div className="text-2xl font-bold text-amber-600">{analysis.riskCount}</div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-gray-500">Nao Homologados</div>
              <div className="text-2xl font-bold text-red-600">{analysis.nonHomologatedCount}</div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-gray-500">Em Atencao</div>
              <div className="text-2xl font-bold text-blue-600">{analysis.attentionCount}</div>
            </div>
          </div>
          {analysis.executiveSummary && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm leading-relaxed">{analysis.executiveSummary}</p>
            </div>
          )}
        </section>

        {/* Inventory */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4 text-[#245C90]">2. Inventario do Ambiente</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="text-left p-2 border">Categoria</th>
                <th className="text-left p-2 border">Item</th>
                <th className="text-left p-2 border">Valor Coletado</th>
                <th className="text-left p-2 border">Valor Esperado</th>
                <th className="text-left p-2 border">Status</th>
                <th className="text-left p-2 border">Observacoes</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(itemsByCategory).map(([category, items]) =>
                items.map((item, idx) => (
                  <tr key={`${category}-${idx}`} className="border-b hover:bg-gray-50">
                    <td className="p-2 border">{idx === 0 ? category : ''}</td>
                    <td className="p-2 border">{item.label}</td>
                    <td className="p-2 border font-mono text-xs">{item.collectedValue || 'Nao informado'}</td>
                    <td className="p-2 border font-mono text-xs">{item.expectedValue || '-'}</td>
                    <td className="p-2 border">
                      <span style={{ color: STATUS_COLORS[item.status] }} className="font-medium">
                        {STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td className="p-2 border text-xs text-gray-600">{item.notes || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* Sizing */}
        {analysis.sizing && (
          <section className="mb-8">
            <h2 className="text-xl font-bold mb-4 text-[#245C90]">3. Dimensionamento</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-3">Infraestrutura Atual</h3>
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td className="py-1">CPU</td><td className="font-mono">{analysis.sizing.currentCpu}</td></tr>
                    <tr><td className="py-1">Memoria RAM</td><td className="font-mono">{analysis.sizing.currentRam}</td></tr>
                    <tr><td className="py-1">Disco</td><td className="font-mono">{analysis.sizing.currentDisk}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-3">Infraestrutura Recomendada</h3>
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td className="py-1">CPU</td><td className="font-mono text-[#245C90] font-semibold">{analysis.sizing.recommendedCpu}</td></tr>
                    <tr><td className="py-1">Memoria RAM</td><td className="font-mono text-[#245C90] font-semibold">{analysis.sizing.recommendedRam}</td></tr>
                    <tr><td className="py-1">Disco</td><td className="font-mono text-[#245C90] font-semibold">{analysis.sizing.recommendedDisk}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-4 p-4 border rounded-lg">
              <span className="font-semibold">Status: </span>
              <Badge variant="outline" className={
                analysis.sizing.sizingStatus === 'ADEQUADO' ? 'border-green-500 text-green-600' :
                analysis.sizing.sizingStatus === 'SUBDIMENSIONADO' ? 'border-red-500 text-red-600' :
                'border-amber-500 text-amber-600'
              }>{analysis.sizing.sizingStatus}</Badge>
              <span className="ml-2 text-sm text-gray-500">Perfil: {analysis.sizing.profile}</span>
            </div>
          </section>
        )}

        {/* Health Check */}
        {analysis.healthCheck && (
          <section className="mb-8">
            <h2 className="text-xl font-bold mb-4 text-[#245C90]">4. Health Check</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg text-center">
                <div className="text-sm text-gray-500">Heap</div>
                <div className="text-xl font-bold">{analysis.healthCheck.heapUsage}%</div>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <div className="text-sm text-gray-500">CPU</div>
                <div className="text-xl font-bold">{analysis.healthCheck.cpuUsage}%</div>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <div className="text-sm text-gray-500">Memoria</div>
                <div className="text-xl font-bold">{analysis.healthCheck.memoryUsage}%</div>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <div className="text-sm text-gray-500">Disco</div>
                <div className="text-xl font-bold">{analysis.healthCheck.diskUsage}%</div>
              </div>
            </div>
            {analysis.healthCheck.aiInterpretation && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold mb-2">Interpretacao da IA</h3>
                <p className="text-sm leading-relaxed">{analysis.healthCheck.aiInterpretation}</p>
              </div>
            )}
          </section>
        )}

        {/* Recommendations */}
        {analysis.recommendations && analysis.recommendations.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold mb-4 text-[#245C90]">5. Recomendacoes</h2>
            <ol className="list-decimal list-inside space-y-2">
              {analysis.recommendations.map((rec, idx) => (
                <li key={idx} className="text-sm leading-relaxed">{rec}</li>
              ))}
            </ol>
          </section>
        )}

        {/* Footer */}
        <div className="border-t pt-4 text-center text-xs text-gray-400">
          <p>Relatorio gerado por InsightLog em {new Date().toLocaleString('pt-BR')}</p>
        </div>
      </div>
    </main>
  );
}
