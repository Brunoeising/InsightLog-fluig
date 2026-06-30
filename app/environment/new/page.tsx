'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Server, Cpu, Database, Coffee, FileUp, ArrowRight, ArrowLeft, Activity } from 'lucide-react';
import NavBar from '@/components/NavBar';
import { getCurrentUser } from '@/lib/supabase-client';
import { runEnvironmentAnalysis } from '@/lib/environment-service';
import { EnvironmentInventory, SizingInput } from '@/lib/types';

const emptyInventory: EnvironmentInventory = {
  os_name: '', os_version: '', os_build: '', architecture: '',
  cpu_cores: '', cpu_vcpu: '', ram_gb: '', disk_gb: '',
  java_version: '', java_vendor: '', java_home: '',
  fluig_version: '', fluig_patch: '', fluig_directory: '',
  database_type: '', database_version: '', database_charset: '', database_collation: '',
  appserver_type: '', nginx_version: '', apache_version: '',
};

const emptySizing: SizingInput = {
  registered_users: 0, concurrent_users: 0, process_count: 0,
  doc_volume: 0, dataset_count: 0, integration_volume: 0,
};

export default function NewEnvironmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [environmentName, setEnvironmentName] = useState('');
  const [inventory, setInventory] = useState<EnvironmentInventory>(emptyInventory);
  const [sizing, setSizing] = useState<SizingInput>(emptySizing);
  const [healthCheckRaw, setHealthCheckRaw] = useState({
    heapUsage: '', cpuUsage: '', memoryUsage: '', diskUsage: '',
  });

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }
      setIsAuthenticated(true);
    };
    checkAuth();
  }, [router]);

  const updateInventory = useCallback((field: keyof EnvironmentInventory, value: string) => {
    setInventory(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateSizing = useCallback((field: keyof SizingInput, value: number) => {
    setSizing(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        setInventory(prev => ({ ...prev, ...data }));
        toast({ title: 'Inventario carregado', description: 'Os campos foram preenchidos automaticamente.' });
      } catch {
        toast({ title: 'Erro', description: 'Arquivo JSON invalido.', variant: 'destructive' });
      }
    };
    reader.readAsText(file);
  }, [toast]);

  const handleHealthCheckUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        setHealthCheckRaw({
          heapUsage: String(data.heap_usage || ''),
          cpuUsage: String(data.cpu_usage || ''),
          memoryUsage: String(data.memory_usage || ''),
          diskUsage: String(data.disk_usage || ''),
        });
        toast({ title: 'Health check carregado', description: 'Metricas de saude importadas.' });
      } catch {
        toast({ title: 'Erro', description: 'Arquivo JSON invalido.', variant: 'destructive' });
      }
    };
    reader.readAsText(file);
  }, [toast]);

  const handleRunAnalysis = useCallback(async () => {
    if (!environmentName.trim()) {
      toast({ title: 'Nome obrigatorio', description: 'Informe o nome do ambiente.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const healthData = healthCheckRaw.heapUsage ? {
        heapUsage: parseFloat(healthCheckRaw.heapUsage) || null,
        cpuUsage: parseFloat(healthCheckRaw.cpuUsage) || null,
        memoryUsage: parseFloat(healthCheckRaw.memoryUsage) || null,
        diskUsage: parseFloat(healthCheckRaw.diskUsage) || null,
        servicesStatus: null,
        aiInterpretation: null,
      } : undefined;

      const { analysisId } = await runEnvironmentAnalysis(
        environmentName,
        inventory,
        sizing,
        healthData
      );

      toast({ title: 'Analise concluida', description: 'Redirecionando para o dashboard...' });
      router.push(`/environment/${analysisId}`);
    } catch (err: any) {
      toast({ title: 'Erro na analise', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [environmentName, inventory, sizing, healthCheckRaw, router, toast]);

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  const steps = [
    { num: 1, label: 'Identificacao', icon: Server },
    { num: 2, label: 'Sistema Operacional', icon: Server },
    { num: 3, label: 'Hardware', icon: Cpu },
    { num: 4, label: 'Java', icon: Coffee },
    { num: 5, label: 'Fluig', icon: Server },
    { num: 6, label: 'Banco de Dados', icon: Database },
    { num: 7, label: 'Dimensionamento', icon: Activity },
    { num: 8, label: 'Health Check', icon: Activity },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-secondary/10 text-foreground">
      <NavBar />

      <div className="max-w-5xl mx-auto pt-24 px-6 md:px-10 pb-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Nova Analise de Ambiente</h1>
          <p className="text-muted-foreground">
            Informe os dados do ambiente Fluig ou faca upload do arquivo de inventario gerado pelos scripts de coleta.
          </p>
        </div>

        {/* Upload de inventario */}
        <Card className="mb-6 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                <FileUp className="h-10 w-10 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Importar Inventario Automatico</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Faca upload do arquivo <code className="text-xs bg-muted px-1 py-0.5 rounded">inventario.json</code> gerado pelos scripts de coleta para preencher os campos automaticamente.
                </p>
                <Input type="file" accept=".json" onChange={handleFileUpload} className="max-w-xs" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stepper */}
        <div className="flex flex-wrap gap-2 mb-8">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.num}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                  step === s.num
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : step > s.num
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{s.label}</span>
                <span className="md:hidden">{s.num}</span>
              </div>
            );
          })}
        </div>

        {/* Step 1: Identificacao */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Identificacao do Ambiente</CardTitle>
              <CardDescription>Informe um nome para identificar este ambiente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="env-name">Nome do Ambiente</Label>
                <Input
                  id="env-name"
                  value={environmentName}
                  onChange={(e) => setEnvironmentName(e.target.value)}
                  placeholder="Ex: Producao Cliente X"
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setStep(2)} disabled={!environmentName.trim()}>
                  Proximo <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Sistema Operacional */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Sistema Operacional</CardTitle>
              <CardDescription>Informacoes do sistema operacional do servidor.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome do SO</Label>
                  <Input value={inventory.os_name} onChange={(e) => updateInventory('os_name', e.target.value)} placeholder="Ex: Red Hat Enterprise Linux" className="mt-1" />
                </div>
                <div>
                  <Label>Versao</Label>
                  <Input value={inventory.os_version} onChange={(e) => updateInventory('os_version', e.target.value)} placeholder="Ex: 8.6" className="mt-1" />
                </div>
                <div>
                  <Label>Build / Kernel</Label>
                  <Input value={inventory.os_build} onChange={(e) => updateInventory('os_build', e.target.value)} placeholder="Ex: 4.18.0-372" className="mt-1" />
                </div>
                <div>
                  <Label>Arquitetura</Label>
                  <Select value={inventory.architecture} onValueChange={(v) => updateInventory('architecture', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="x86_64">64-bit (x86_64)</SelectItem>
                      <SelectItem value="64">64-bit</SelectItem>
                      <SelectItem value="x86">32-bit (x86)</SelectItem>
                      <SelectItem value="32">32-bit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={() => setStep(3)}>Proximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Hardware */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Hardware</CardTitle>
              <CardDescription>Recursos de hardware do servidor.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nucleos de CPU</Label>
                  <Input type="number" value={inventory.cpu_cores} onChange={(e) => updateInventory('cpu_cores', e.target.value)} placeholder="Ex: 8" className="mt-1" />
                </div>
                <div>
                  <Label>vCPU</Label>
                  <Input type="number" value={inventory.cpu_vcpu} onChange={(e) => updateInventory('cpu_vcpu', e.target.value)} placeholder="Ex: 16" className="mt-1" />
                </div>
                <div>
                  <Label>Memoria RAM (GB)</Label>
                  <Input type="number" value={inventory.ram_gb} onChange={(e) => updateInventory('ram_gb', e.target.value)} placeholder="Ex: 32" className="mt-1" />
                </div>
                <div>
                  <Label>Espaco em Disco (GB)</Label>
                  <Input type="number" value={inventory.disk_gb} onChange={(e) => updateInventory('disk_gb', e.target.value)} placeholder="Ex: 200" className="mt-1" />
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={() => setStep(4)}>Proximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Java */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Java</CardTitle>
              <CardDescription>Informacoes da instalacao do Java.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Versao</Label>
                  <Input value={inventory.java_version} onChange={(e) => updateInventory('java_version', e.target.value)} placeholder="Ex: 17.0.2" className="mt-1" />
                </div>
                <div>
                  <Label>Vendor</Label>
                  <Input value={inventory.java_vendor} onChange={(e) => updateInventory('java_vendor', e.target.value)} placeholder="Ex: Oracle" className="mt-1" />
                </div>
                <div>
                  <Label>JAVA_HOME</Label>
                  <Input value={inventory.java_home} onChange={(e) => updateInventory('java_home', e.target.value)} placeholder="Ex: /usr/lib/jvm/java-17" className="mt-1" />
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={() => setStep(5)}>Proximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Fluig */}
        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle>Fluig</CardTitle>
              <CardDescription>Informacoes da instalacao do Fluig (se aplicavel).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Versao</Label>
                  <Input value={inventory.fluig_version} onChange={(e) => updateInventory('fluig_version', e.target.value)} placeholder="Ex: 4.0.0" className="mt-1" />
                </div>
                <div>
                  <Label>Patch Aplicado</Label>
                  <Input value={inventory.fluig_patch} onChange={(e) => updateInventory('fluig_patch', e.target.value)} placeholder="Ex: HF_4.0.0_20240101" className="mt-1" />
                </div>
                <div>
                  <Label>Diretorio de Instalacao</Label>
                  <Input value={inventory.fluig_directory} onChange={(e) => updateInventory('fluig_directory', e.target.value)} placeholder="Ex: /opt/fluig" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                <div>
                  <Label>Servidor de Aplicacao</Label>
                  <Input value={inventory.appserver_type} onChange={(e) => updateInventory('appserver_type', e.target.value)} placeholder="Ex: WildFly 26" className="mt-1" />
                </div>
                <div>
                  <Label>Nginx</Label>
                  <Input value={inventory.nginx_version} onChange={(e) => updateInventory('nginx_version', e.target.value)} placeholder="Ex: 1.24" className="mt-1" />
                </div>
                <div>
                  <Label>Apache</Label>
                  <Input value={inventory.apache_version} onChange={(e) => updateInventory('apache_version', e.target.value)} placeholder="Ex: 2.4" className="mt-1" />
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(4)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={() => setStep(6)}>Proximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 6: Banco de Dados */}
        {step === 6 && (
          <Card>
            <CardHeader>
              <CardTitle>Banco de Dados</CardTitle>
              <CardDescription>Informacoes do banco de dados utilizado pelo Fluig.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Tipo</Label>
                  <Select value={inventory.database_type} onValueChange={(v) => updateInventory('database_type', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Oracle">Oracle</SelectItem>
                      <SelectItem value="Microsoft SQL Server">Microsoft SQL Server</SelectItem>
                      <SelectItem value="PostgreSQL">PostgreSQL</SelectItem>
                      <SelectItem value="MySQL">MySQL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Versao</Label>
                  <Input value={inventory.database_version} onChange={(e) => updateInventory('database_version', e.target.value)} placeholder="Ex: 19c" className="mt-1" />
                </div>
                <div>
                  <Label>Charset</Label>
                  <Input value={inventory.database_charset} onChange={(e) => updateInventory('database_charset', e.target.value)} placeholder="Ex: AL32UTF8" className="mt-1" />
                </div>
                <div>
                  <Label>Collation</Label>
                  <Input value={inventory.database_collation} onChange={(e) => updateInventory('database_collation', e.target.value)} placeholder="Ex: BINARY" className="mt-1" />
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(5)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={() => setStep(7)}>Proximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 7: Dimensionamento */}
        {step === 7 && (
          <Card>
            <CardHeader>
              <CardTitle>Simulador de Dimensionamento</CardTitle>
              <CardDescription>Informe os parametros de uso para calcular a infraestrutura recomendada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Usuarios Cadastrados</Label>
                  <Input type="number" value={sizing.registered_users} onChange={(e) => updateSizing('registered_users', parseInt(e.target.value) || 0)} className="mt-1" />
                </div>
                <div>
                  <Label>Usuarios Simultaneos</Label>
                  <Input type="number" value={sizing.concurrent_users} onChange={(e) => updateSizing('concurrent_users', parseInt(e.target.value) || 0)} className="mt-1" />
                </div>
                <div>
                  <Label>Numero de Processos</Label>
                  <Input type="number" value={sizing.process_count} onChange={(e) => updateSizing('process_count', parseInt(e.target.value) || 0)} className="mt-1" />
                </div>
                <div>
                  <Label>Volume Documental</Label>
                  <Input type="number" value={sizing.doc_volume} onChange={(e) => updateSizing('doc_volume', parseInt(e.target.value) || 0)} className="mt-1" />
                </div>
                <div>
                  <Label>Numero de Datasets</Label>
                  <Input type="number" value={sizing.dataset_count} onChange={(e) => updateSizing('dataset_count', parseInt(e.target.value) || 0)} className="mt-1" />
                </div>
                <div>
                  <Label>Volume de Integracoes</Label>
                  <Input type="number" value={sizing.integration_volume} onChange={(e) => updateSizing('integration_volume', parseInt(e.target.value) || 0)} className="mt-1" />
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(6)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={() => setStep(8)}>Proximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 8: Health Check (opcional) */}
        {step === 8 && (
          <Card>
            <CardHeader>
              <CardTitle>Health Check (Opcional)</CardTitle>
              <CardDescription>Faca upload do arquivo de health check ou informe as metricas manualmente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <FileUp className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Upload do <code className="text-xs bg-muted px-1 py-0.5 rounded">healthcheck.json</code></p>
                  <Input type="file" accept=".json" onChange={handleHealthCheckUpload} className="max-w-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>Heap (%)</Label>
                  <Input type="number" value={healthCheckRaw.heapUsage} onChange={(e) => setHealthCheckRaw(prev => ({ ...prev, heapUsage: e.target.value }))} placeholder="Ex: 65" className="mt-1" />
                </div>
                <div>
                  <Label>CPU (%)</Label>
                  <Input type="number" value={healthCheckRaw.cpuUsage} onChange={(e) => setHealthCheckRaw(prev => ({ ...prev, cpuUsage: e.target.value }))} placeholder="Ex: 45" className="mt-1" />
                </div>
                <div>
                  <Label>Memoria (%)</Label>
                  <Input type="number" value={healthCheckRaw.memoryUsage} onChange={(e) => setHealthCheckRaw(prev => ({ ...prev, memoryUsage: e.target.value }))} placeholder="Ex: 70" className="mt-1" />
                </div>
                <div>
                  <Label>Disco (%)</Label>
                  <Input type="number" value={healthCheckRaw.diskUsage} onChange={(e) => setHealthCheckRaw(prev => ({ ...prev, diskUsage: e.target.value }))} placeholder="Ex: 55" className="mt-1" />
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(7)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={handleRunAnalysis} disabled={isLoading}>
                  {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analisando...</> : 'Executar Analise'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
