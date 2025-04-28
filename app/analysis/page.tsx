"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  BarChart, 
  ChevronLeft,
  FileText,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  Search,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Gauge,
  Filter
} from 'lucide-react';
import { LogAnalysisResult, LogErrorEntry, LogEntry, PerformanceIssue, ErrorCategory } from '@/lib/types';
import { ErrorDetails } from '@/components/error-details';
import { AIChat } from '@/components/ai-chat';
import { PerformanceDetails } from '@/components/performance-details';
import { SystemInfo } from '@/components/system-info';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const ERROR_CATEGORIES: { value: ErrorCategory; label: string }[] = [
  { value: 'DATABASE', label: 'Banco de Dados' },
  { value: 'PERMISSION', label: 'Permissão' },
  { value: 'WORKFLOW', label: 'Workflow' },
  { value: 'PERFORMANCE', label: 'Performance' },
  { value: 'NETWORK', label: 'Rede' },
  { value: 'INFRASTRUCTURE', label: 'Infraestrutura' },
  { value: 'OTHER', label: 'Outros' }
];

export default function AnalysisPage() {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<LogAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<ErrorCategory[]>(
    ERROR_CATEGORIES.map(cat => cat.value)
  );
  
  // Pagination state
  const [pageSize, setPageSize] = useState(25);
  const [currentErrorPage, setCurrentErrorPage] = useState(1);
  const [currentWarningPage, setCurrentWarningPage] = useState(1);
  const [currentPerformancePage, setCurrentPerformancePage] = useState(1);
  
  // Filtered lists
  const [filteredErrors, setFilteredErrors] = useState<LogErrorEntry[]>([]);
  const [filteredWarnings, setFilteredWarnings] = useState<LogEntry[]>([]);
  const [filteredPerformanceIssues, setFilteredPerformanceIssues] = useState<PerformanceIssue[]>([]);

  useEffect(() => {
    const storedAnalysis = localStorage.getItem('currentAnalysis');
    
    if (storedAnalysis) {
      const parsedAnalysis = JSON.parse(storedAnalysis);
      
      // Ensure we only have ERROR level entries in the errors array
      const errorEntries = (parsedAnalysis.errors || []).filter(
        (error: LogErrorEntry) => error.level === 'ERROR'
      );
      
      // Ensure we only have WARN level entries in the warnings array
      const warningEntries = (parsedAnalysis.warnings || []).filter(
        (warning: LogEntry) => warning.level === 'WARN'
      );
      
      setAnalysis({
        ...parsedAnalysis,
        errors: errorEntries,
        warnings: warningEntries,
        performanceIssues: parsedAnalysis.performanceIssues || [],
        errorCount: errorEntries.length,
        warningCount: warningEntries.length,
        systemInfo: parsedAnalysis.systemInfo || {}
      });
      
      setFilteredErrors(errorEntries);
      setFilteredWarnings(warningEntries);
      setFilteredPerformanceIssues(parsedAnalysis.performanceIssues || []);
    } else {
      router.push('/');
    }
    
    setIsLoading(false);
  }, [router]);

  // Filter function
  useEffect(() => {
    if (!analysis) return;

    const term = searchTerm.toLowerCase();
    
    // Filter errors - only ERROR level entries and selected categories
    const errors = analysis.errors.filter(error => 
      error.level === 'ERROR' && 
      selectedCategories.includes(error.category) &&
      (
        error.message.toLowerCase().includes(term) ||
        (error.category || '').toLowerCase().includes(term) ||
        (error.contextBefore || []).some(ctx => ctx.toLowerCase().includes(term)) ||
        (error.contextAfter || []).some(ctx => ctx.toLowerCase().includes(term))
      )
    );
    setFilteredErrors(errors);
    setCurrentErrorPage(1);

    // Filter warnings - only WARN level entries
    const warnings = analysis.warnings?.filter(warning =>
      warning.level === 'WARN' &&
      warning.message.toLowerCase().includes(term)
    ) || [];
    setFilteredWarnings(warnings);
    setCurrentWarningPage(1);

    // Filter performance issues
    const performanceIssues = analysis.performanceIssues?.filter(issue =>
      issue.message.toLowerCase().includes(term) ||
      issue.type.toLowerCase().includes(term) ||
      (issue.context || '').toLowerCase().includes(term)
    ) || [];
    setFilteredPerformanceIssues(performanceIssues);
    setCurrentPerformancePage(1);
  }, [searchTerm, analysis, selectedCategories]);

  const handleCategoryToggle = (category: ErrorCategory) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  const getErrorCountByCategory = () => {
    const counts: Record<string, number> = {};
    
    analysis.errors.filter(error => error.level === 'ERROR').forEach(error => {
      counts[error.category] = (counts[error.category] || 0) + 1;
    });
    
    return Object.entries(counts).map(([category, count]) => ({
      category,
      count
    }));
  };

  const errorCategories = getErrorCountByCategory();

  // Pagination calculations
  const totalErrorPages = Math.ceil(filteredErrors.length / pageSize);
  const totalWarningPages = Math.ceil(filteredWarnings.length / pageSize);
  const totalPerformancePages = Math.ceil(filteredPerformanceIssues.length / pageSize);
  
  const paginatedErrors = filteredErrors.slice(
    (currentErrorPage - 1) * pageSize,
    currentErrorPage * pageSize
  );
  
  const paginatedWarnings = filteredWarnings.slice(
    (currentWarningPage - 1) * pageSize,
    currentWarningPage * pageSize
  );

  const paginatedPerformanceIssues = filteredPerformanceIssues.slice(
    (currentPerformancePage - 1) * pageSize,
    currentPerformancePage * pageSize
  );

  const PaginationControls = ({ 
    currentPage, 
    totalPages, 
    onPageChange 
  }: { 
    currentPage: number; 
    totalPages: number; 
    onPageChange: (page: number) => void;
  }) => (
    <div className="flex items-center justify-between mt-4 border-t pt-4">
      <div className="flex items-center gap-2">
        <Select
          value={pageSize.toString()}
          onValueChange={(value) => {
            setPageSize(Number(value));
            onPageChange(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Registros por página" />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map(size => (
              <SelectItem key={size} value={size.toString()}>
                {size} registros por página
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <span className="text-sm text-muted-foreground">
          Página {currentPage} de {totalPages}
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => router.push('/')}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Resultados da Análise de Log</h1>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                {analysis.fileName}
              </span>
            </div>
            
            <div className="flex gap-2">
              <Badge variant="outline" className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-destructive" />
                {analysis.errorCount} Erros
              </Badge>
              
              <Badge variant="outline" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-chart-4" />
                {analysis.warningCount} Avisos
              </Badge>

              <Badge variant="outline" className="flex items-center gap-1">
                <Gauge className="h-3 w-3 text-chart-2" />
                {filteredPerformanceIssues.length} Problemas de Performance
              </Badge>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <SystemInfo systemInfo={analysis.systemInfo || {}} />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
              <CardDescription>Visão geral dos problemas do log gerada por IA</CardDescription>
            </CardHeader>
            <CardContent>
              <p>{analysis.summary}</p>
              
              <div className="mt-6">
                <h4 className="font-medium mb-2">Ações Sugeridas:</h4>
                <ul className="space-y-2">
                  {analysis.suggestions.map((suggestion, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Categorias de Erro</CardTitle>
              <CardDescription>Distribuição de erros por tipo</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {errorCategories.map(({ category, count }) => (
                  <div key={category} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`category-${category}`}
                          checked={selectedCategories.includes(category as ErrorCategory)}
                          onCheckedChange={() => handleCategoryToggle(category as ErrorCategory)}
                        />
                        <label
                          htmlFor={`category-${category}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {translateCategory(category)}
                        </label>
                      </div>
                      <span className="text-sm text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div 
                        className="h-full bg-primary"
                        style={{ 
                          width: `${(count / analysis.errorCount) * 100}%`,
                          backgroundColor: getCategoryColor(category)
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar em erros, avisos e problemas de performance..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        
        <Tabs defaultValue="errors" className="mb-8">
          <TabsList>
            <TabsTrigger value="errors" className="flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Erros {filteredErrors.length > 0 && `(${filteredErrors.length})`}
            </TabsTrigger>
            <TabsTrigger value="warnings" className="flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              Avisos {filteredWarnings.length > 0 && `(${filteredWarnings.length})`}
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-1">
              <Gauge className="h-4 w-4" />
              Performance {filteredPerformanceIssues.length > 0 && `(${filteredPerformanceIssues.length})`}
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              Perguntar à IA
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="errors" className="mt-6">
            <div className="space-y-6">
              {paginatedErrors.map((error, index) => (
                <ErrorDetails 
                  key={index} 
                  error={error} 
                  index={(currentErrorPage - 1) * pageSize + index} 
                />
              ))}
              {filteredErrors.length === 0 && (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    {searchTerm ? "Nenhum erro encontrado para sua busca." : "Nenhum erro encontrado."}
                  </CardContent>
                </Card>
              )}
              {filteredErrors.length > 0 && (
                <PaginationControls
                  currentPage={currentErrorPage}
                  totalPages={totalErrorPages}
                  onPageChange={setCurrentErrorPage}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="warnings" className="mt-6">
            <div className="space-y-6">
              {paginatedWarnings.map((warning, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-chart-4 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-sm mb-1">{warning.message}</p>
                        <p className="text-xs text-muted-foreground">{warning.timestamp}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredWarnings.length === 0 && (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    {searchTerm ? "Nenhum aviso encontrado para sua busca." : "Nenhum aviso encontrado."}
                  </CardContent>
                </Card>
              )}
              {filteredWarnings.length > 0 && (
                <PaginationControls
                  currentPage={currentWarningPage}
                  totalPages={totalWarningPages}
                  onPageChange={setCurrentWarningPage}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="performance" className="mt-6">
            <div className="space-y-6">
              {paginatedPerformanceIssues.map((issue, index) => (
                <PerformanceDetails
                  key={index}
                  issue={issue}
                  index={(currentPerformancePage - 1) * pageSize + index}
                />
              ))}
              {filteredPerformanceIssues.length === 0 && (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    {searchTerm ? "Nenhum problema de performance encontrado para sua busca." : "Nenhum problema de performance encontrado."}
                  </CardContent>
                </Card>
              )}
              {filteredPerformanceIssues.length > 0 && (
                <PaginationControls
                  currentPage={currentPerformancePage}
                  totalPages={totalPerformancePages}
                  onPageChange={setCurrentPerformancePage}
                />
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="chat" className="mt-6">
            <AIChat logContent={analysis.content || ''} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    'DATABASE': 'hsl(var(--chart-1))',
    'PERMISSION': 'hsl(var(--chart-2))',
    'WORKFLOW': 'hsl(var(--chart-3))',
    'PERFORMANCE': 'hsl(var(--chart-4))',
    'NETWORK': 'hsl(var(--chart-5))',
    'INFRASTRUCTURE': 'hsl(var(--chart-6))',
    'OTHER': 'hsl(var(--muted))'
  };
  
  return colors[category] || colors['OTHER'];
}

function translateCategory(category: string): string {
  const translations: Record<string, string> = {
    'DATABASE': 'Banco de Dados',
    'PERMISSION': 'Permissão',
    'WORKFLOW': 'Workflow',
    'PERFORMANCE': 'Performance',
    'NETWORK': 'Rede',
    'INFRASTRUCTURE': 'Infraestrutura',
    'OTHER': 'Outros'
  };
  
  return translations[category] || category;
}