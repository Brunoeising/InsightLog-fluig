'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Server, Cpu, Database, Coffee, FileUp, ArrowRight, ArrowLeft,
  Activity, Info, AlertTriangle, CheckCircle2,
} from 'lucide-react';
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

// Opcoes baseadas na Matriz de Portabilidade Fluig (TDN)
const OS_OPTIONS = [
  { value: 'Red Hat Enterprise Linux 6.x', label: 'Red Hat Enterprise Linux 6.x' },
  { value: 'Red Hat Enterprise Linux 7.x', label: 'Red Hat Enterprise Linux 7.x' },
  { value: 'Red Hat Enterprise Linux 8.x', label: 'Red Hat Enterprise Linux 8.x' },
  { value: 'Red Hat Enterprise Linux 9.x', label: 'Red Hat Enterprise Linux 9.x (requer Fluig 2.0+)' },
  { value: 'Oracle Linux 6.x', label: 'Oracle Linux 6.x' },
  { value: 'Oracle Linux 7.x', label: 'Oracle Linux 7.x' },
  { value: 'Oracle Linux 8.x', label: 'Oracle Linux 8.x' },
  { value: 'Oracle Linux 9.x', label: 'Oracle Linux 9.x (requer Fluig 2.0+)' },
  { value: 'CentOS 6.x', label: 'CentOS 6.x' },
  { value: 'CentOS 7.x', label: 'CentOS 7.x' },
  { value: 'Ubuntu Server 16.04', label: 'Ubuntu Server 16.04 LTS' },
  { value: 'Ubuntu Server 18.04', label: 'Ubuntu Server 18.04 LTS' },
  { value: 'Ubuntu Server 20.04', label: 'Ubuntu Server 20.04 LTS' },
  { value: 'Ubuntu Server 22.04', label: 'Ubuntu Server 22.04 LTS' },
  { value: 'Ubuntu Server 24.04', label: 'Ubuntu Server 24.04 LTS (requer Fluig 2.0+)' },
  { value: 'Windows Server 2016', label: 'Windows Server 2016' },
  { value: 'Windows Server 2019', label: 'Windows Server 2019' },
  { value: 'Windows Server 2022', label: 'Windows Server 2022 (requer Fluig 2.0+)' },
  { value: 'Windows Server 2025', label: 'Windows Server 2025 (em analise TOTVS)' },
];

const JAVA_VERSION_OPTIONS = [
  { value: 'OpenJDK 11', label: 'OpenJDK 11 (LTS - Homologado)' },
  { value: 'OpenJDK 17', label: 'OpenJDK 17 (LTS - Homologado)' },
  { value: 'OpenJDK 21', label: 'OpenJDK 21 (Em analise TOTVS)' },
  { value: 'Oracle JDK 11', label: 'Oracle JDK 11 (Homologado)' },
  { value: 'Oracle JDK 17', label: 'Oracle JDK 17 (Homologado)' },
  { value: 'Eclipse Temurin 11', label: 'Eclipse Temurin 11 (Homologado)' },
  { value: 'Eclipse Temurin 17', label: 'Eclipse Temurin 17 (Homologado)' },
  { value: 'Amazon Corretto 11', label: 'Amazon Corretto 11 (Homologado)' },
  { value: 'Amazon Corretto 17', label: 'Amazon Corretto 17 (Homologado)' },
  { value: 'Azul Zulu 11', label: 'Azul Zulu 11 (Homologado)' },
  { value: 'Azul Zulu 17', label: 'Azul Zulu 17 (Homologado)' },
  { value: 'OpenJDK 8', label: 'OpenJDK 8 (Restricao: apenas Fluig antigo)' },
];

const JAVA_VENDOR_OPTIONS = [
  { value: 'OpenJDK', label: 'OpenJDK' },
  { value: 'Oracle', label: 'Oracle' },
  { value: 'Eclipse Temurin', label: 'Eclipse Temurin (Adoptium)' },
  { value: 'Amazon Corretto', label: 'Amazon Corretto' },
  { value: 'Azul Zulu', label: 'Azul Zulu' },
  { value: 'IBM', label: 'IBM (Nao homologado)' },
];

const DB_OPTIONS = [
  { value: 'Oracle 19c', label: 'Oracle 19c (Homologado)', charset: 'AL32UTF8', collation: 'BINARY' },
  { value: 'Microsoft SQL Server 2016', label: 'Microsoft SQL Server 2016', charset: 'UTF-8', collation: 'SQL_Latin1_General_CP1_CI_AS' },
  { value: 'Microsoft SQL Server 2017', label: 'Microsoft SQL Server 2017', charset: 'UTF-8', collation: 'SQL_Latin1_General_CP1_CI_AS' },
  { value: 'Microsoft SQL Server 2019', label: 'Microsoft SQL Server 2019', charset: 'UTF-8', collation: 'SQL_Latin1_General_CP1_CI_AS' },
  { value: 'Microsoft SQL Server 2022', label: 'Microsoft SQL Server 2022 (requer Fluig 2.0+)', charset: 'UTF-8', collation: 'SQL_Latin1_General_CP1_CI_AS' },
  { value: 'MySQL 8.0', label: 'MySQL 8.0 (requer Fluig 1.8.1+, versao minima 8.0.27)', charset: 'utf8mb4', collation: 'utf8mb4_general_ci' },
  { value: 'PostgreSQL', label: 'PostgreSQL (Nao homologado pelo Fluig)', charset: '', collation: '' },
  { value: 'MariaDB', label: 'MariaDB (Nao homologado)', charset: '', collation: '' },
];

const NGINX_OPTIONS = [
  { value: 'Nginx 1.22', label: 'Nginx 1.22 (Homologado)' },
  { value: 'Nginx 1.20', label: 'Nginx 1.20 (Restricao: upgrade recomendado)' },
  { value: 'Nginx 1.18', label: 'Nginx 1.18 (Restricao: upgrade recomendado)' },
  { value: 'Nginx 1.24', label: 'Nginx 1.24 (Em analise - incompativel com nginx-stick-module-ng)' },
  { value: 'Nginx 1.26', label: 'Nginx 1.26 (Em analise - incompativel com nginx-stick-module-ng)' },
  { value: 'Nginx 1.28', label: 'Nginx 1.28 (Em analise - incompativel com nginx-stick-module-ng)' },
  { value: '', label: 'Sem Nginx (nao usa reverse proxy)' },
];

const APPSERVER_OPTIONS = [
  { value: 'JBoss (embutido no Fluig)', label: 'JBoss embutido (padrao do instalador Fluig)' },
  { value: 'WildFly (embutido no Fluig)', label: 'WildFly embutido (padrao do instalador Fluig)' },
  { value: 'Tomcat', label: 'Tomcat (Nao homologado pelo Fluig)' },
  { value: 'WebSphere', label: 'WebSphere (Nao homologado pelo Fluig)' },
  { value: 'WebLogic', label: 'WebLogic (Nao homologado pelo Fluig)' },
];

// Perfis de dimensionamento do modelo oficial (TDN)
const SIZING_PROFILES = [
  { label: 'Perfil P — ate 100 usuarios registrados / 80 concorrentes', registered: 100, concurrent: 80 },
  { label: 'Perfil M — ate 300 usuarios registrados / 150 concorrentes', registered: 300, concurrent: 150 },
  { label: 'Perfil G — ate 500 usuarios registrados / 220 concorrentes', registered: 500, concurrent: 220 },
  { label: 'Acima do limite — avaliacao customizada TOTVS', registered: 501, concurrent: 221 },
];

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
      <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function WarnBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

export default function NewEnvironmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [environmentName, setEnvironmentName] = useState('');
  const [inventory, setInventory] = useState<EnvironmentInventory>(emptyInventory);
  const [sizing, setSizing] = useState<SizingInput>(emptySizing);
  const [sizingProfile, setSizingProfile] = useState('');
  const [healthCheckRaw, setHealthCheckRaw] = useState({
    heapUsage: '', cpuUsage: '', memoryUsage: '', diskUsage: '',
  });

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser();
      if (!user) { router.push('/auth/login'); return; }
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

  const handleDbSelect = useCallback((value: string) => {
    const opt = DB_OPTIONS.find(d => d.value === value);
    setInventory(prev => ({
      ...prev,
      database_type: value,
      database_charset: opt?.charset || prev.database_charset,
      database_collation: opt?.collation || prev.database_collation,
    }));
  }, []);

  const handleSizingProfileSelect = useCallback((label: string) => {
    setSizingProfile(label);
    const profile = SIZING_PROFILES.find(p => p.label === label);
    if (profile) {
      setSizing(prev => ({
        ...prev,
        registered_users: profile.registered,
        concurrent_users: profile.concurrent,
      }));
    }
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
          heapUsage: String(data.heap_usage ?? ''),
          cpuUsage: String(data.cpu_usage ?? ''),
          memoryUsage: String(data.memory_usage ?? ''),
          diskUsage: String(data.disk_usage ?? ''),
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

      const { analysisId } = await runEnvironmentAnalysis(environmentName, inventory, sizing, healthData);
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
    { num: 2, label: 'Fluig', icon: Server },
    { num: 3, label: 'Sistema Operacional', icon: Server },
    { num: 4, label: 'Hardware', icon: Cpu },
    { num: 5, label: 'Java', icon: Coffee },
    { num: 6, label: 'Banco de Dados', icon: Database },
    { num: 7, label: 'Infra / Proxy', icon: Server },
    { num: 8, label: 'Dimensionamento', icon: Activity },
    { num: 9, label: 'Health Check', icon: Activity },
  ];

  // Determina se o DB selecionado tem restricoes dependentes da versao do Fluig
  const dbHasVersionWarning = inventory.database_type?.includes('MySQL') || inventory.database_type?.includes('SQL Server 2022') || inventory.database_type?.includes('2022');
  const isOverSizingLimit = sizing.registered_users > 500 || sizing.concurrent_users > 220;

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-secondary/10 text-foreground">
      <NavBar />

      <div className="max-w-4xl mx-auto pt-24 px-6 md:px-10 pb-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Nova Analise de Ambiente</h1>
          <p className="text-muted-foreground">
            Informe os dados do ambiente Fluig ou faca upload do arquivo de inventario gerado pelos scripts de coleta.
          </p>
        </div>

        {/* Upload de inventario */}
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-4">
              <FileUp className="h-9 w-9 text-primary flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Importar via Script de Coleta</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Faca upload do <code className="text-xs bg-muted px-1 py-0.5 rounded">inventario.json</code> gerado pelo script <code className="text-xs bg-muted px-1 py-0.5 rounded">coleta-linux.sh</code> ou <code className="text-xs bg-muted px-1 py-0.5 rounded">coleta-windows.ps1</code> para preencher automaticamente.
                </p>
                <Input type="file" accept=".json" onChange={handleFileUpload} className="max-w-sm" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stepper */}
        <div className="flex flex-wrap gap-2 mb-8">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.num}
                onClick={() => s.num < step && setStep(s.num)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                  step === s.num
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : step > s.num
                    ? 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                {step > s.num
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <Icon className="h-4 w-4" />}
                <span className="hidden md:inline">{s.label}</span>
                <span className="md:hidden">{s.num}</span>
              </button>
            );
          })}
        </div>

        {/* Step 1: Identificacao */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Identificacao do Ambiente</CardTitle>
              <CardDescription>Informe um nome para identificar este ambiente de analise.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="env-name">Nome do Ambiente *</Label>
                <Input
                  id="env-name"
                  value={environmentName}
                  onChange={(e) => setEnvironmentName(e.target.value)}
                  placeholder="Ex: Producao - Cliente ACME / Homologacao - Servidor 2"
                  className="mt-1"
                />
              </div>
              <InfoBox>
                O nome do ambiente e usado apenas para identificacao nos relatorios. Nao precisa ser o hostname do servidor.
              </InfoBox>
              <div className="flex justify-end">
                <Button onClick={() => setStep(2)} disabled={!environmentName.trim()}>
                  Proximo <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Fluig */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Versao do Fluig</CardTitle>
              <CardDescription>
                Informe a versao do Fluig instalada. Isso influencia a validacao de banco de dados e sistema operacional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Versao do Fluig *</Label>
                  <Input
                    value={inventory.fluig_version}
                    onChange={(e) => updateInventory('fluig_version', e.target.value)}
                    placeholder="Ex: 1.8.1, 2.0.0, 4.5.1"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Patch / Update Release</Label>
                  <Input
                    value={inventory.fluig_patch}
                    onChange={(e) => updateInventory('fluig_patch', e.target.value)}
                    placeholder="Ex: U01, HF_2.0.0_20240601"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Diretorio de Instalacao</Label>
                  <Input
                    value={inventory.fluig_directory}
                    onChange={(e) => updateInventory('fluig_directory', e.target.value)}
                    placeholder="Ex: /opt/fluig | C:\fluig"
                    className="mt-1"
                  />
                </div>
              </div>
              <InfoBox>
                A versao do Fluig e importante para validar compatibilidade com SO, banco de dados e configuracoes de infraestrutura. Exemplos de versoes: 1.6.x, 1.7.x, 1.8.1, 2.0.0.
              </InfoBox>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={() => setStep(3)}>Proximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Sistema Operacional */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Sistema Operacional</CardTitle>
              <CardDescription>SO do servidor de aplicacao do Fluig (nao o servidor de banco de dados).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Sistema Operacional</Label>
                  <Select
                    value={inventory.os_name ? `${inventory.os_name}` : ''}
                    onValueChange={(v) => {
                      const parts = v.split(' ');
                      const version = parts[parts.length - 1];
                      updateInventory('os_name', v);
                      updateInventory('os_version', version);
                    }}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o Sistema Operacional" /></SelectTrigger>
                    <SelectContent>
                      {OS_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Versao / Build</Label>
                  <Input
                    value={inventory.os_version}
                    onChange={(e) => updateInventory('os_version', e.target.value)}
                    placeholder="Ex: 8.7, 22.04, 2019"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Kernel / Build Number</Label>
                  <Input
                    value={inventory.os_build}
                    onChange={(e) => updateInventory('os_build', e.target.value)}
                    placeholder="Ex: 4.18.0-372 | 17763"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Arquitetura</Label>
                  <Select value={inventory.architecture} onValueChange={(v) => updateInventory('architecture', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="x86_64">64-bit (x86_64) — Homologado</SelectItem>
                      <SelectItem value="amd64">64-bit (amd64) — Homologado</SelectItem>
                      <SelectItem value="x86">32-bit (x86) — Nao homologado</SelectItem>
                      <SelectItem value="i386">32-bit (i386) — Nao homologado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(inventory.os_name?.includes('9.x') || inventory.os_name?.includes('24.04') || inventory.os_name?.includes('2022')) && (
                <WarnBox>
                  O SO selecionado requer Fluig 2.0 ou superior. Confirme a versao informada no passo anterior.
                </WarnBox>
              )}
              <InfoBox>
                Somente o SO do servidor de aplicacao Fluig deve ser informado aqui. O banco de dados pode estar em servidor separado.
              </InfoBox>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={() => setStep(4)}>Proximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Hardware */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Hardware do Servidor de Aplicacao</CardTitle>
              <CardDescription>
                Recursos do servidor onde o Fluig esta instalado. Minimo recomendado pelo modelo oficial: 8 vCPU, 16 GB RAM.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>vCPU (nucleos logicos)</Label>
                  <Input
                    type="number"
                    value={inventory.cpu_cores}
                    onChange={(e) => {
                      updateInventory('cpu_cores', e.target.value);
                      updateInventory('cpu_vcpu', e.target.value);
                    }}
                    placeholder="Ex: 8"
                    className="mt-1"
                    min={1}
                  />
                  {parseInt(inventory.cpu_cores) > 0 && parseInt(inventory.cpu_cores) < 8 && (
                    <p className="text-xs text-amber-600 mt-1">Abaixo dos 8 vCPU recomendados pelo modelo de dimensionamento.</p>
                  )}
                </div>
                <div>
                  <Label>Memoria RAM (GB)</Label>
                  <Input
                    type="number"
                    value={inventory.ram_gb}
                    onChange={(e) => updateInventory('ram_gb', e.target.value)}
                    placeholder="Ex: 16"
                    className="mt-1"
                    min={1}
                  />
                  {parseInt(inventory.ram_gb) > 0 && parseInt(inventory.ram_gb) < 16 && (
                    <p className="text-xs text-amber-600 mt-1">Abaixo dos 16 GB minimos. O Fluig aloca 8 GB de heap + 4 GB para SO/plataforma.</p>
                  )}
                </div>
                <div>
                  <Label>Espaco em Disco (GB)</Label>
                  <Input
                    type="number"
                    value={inventory.disk_gb}
                    onChange={(e) => updateInventory('disk_gb', e.target.value)}
                    placeholder="Ex: 100"
                    className="mt-1"
                    min={1}
                  />
                  {parseInt(inventory.disk_gb) > 0 && parseInt(inventory.disk_gb) < 100 && (
                    <p className="text-xs text-amber-600 mt-1">Abaixo dos 100 GB recomendados como base. Adicione espaco para repositorio e cache.</p>
                  )}
                </div>
              </div>
              <InfoBox>
                Todos os perfis de dimensionamento oficiais usam 8 vCPU e 16 GB RAM por instancia. O numero de instancias varia conforme o porte. O disco deve considerar: instalacao (12 GB) + repositorio + cache de acesso diario.
              </InfoBox>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={() => setStep(5)}>Proximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Java */}
        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle>Java</CardTitle>
              <CardDescription>
                Java instalado no servidor de aplicacao Fluig. O Fluig empacoта o JDK no instalador — confirme a versao em uso.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Versao do Java</Label>
                  <Select
                    value={inventory.java_version}
                    onValueChange={(v) => {
                      updateInventory('java_version', v);
                      const vendor = v.split(' ')[0];
                      if (vendor && !inventory.java_vendor) updateInventory('java_vendor', vendor);
                    }}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a versao" /></SelectTrigger>
                    <SelectContent>
                      {JAVA_VERSION_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Vendor</Label>
                  <Select value={inventory.java_vendor} onValueChange={(v) => updateInventory('java_vendor', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o vendor" /></SelectTrigger>
                    <SelectContent>
                      {JAVA_VENDOR_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>JAVA_HOME</Label>
                  <Input
                    value={inventory.java_home}
                    onChange={(e) => updateInventory('java_home', e.target.value)}
                    placeholder="Ex: /usr/lib/jvm/java-17"
                    className="mt-1"
                  />
                </div>
              </div>
              {inventory.java_version?.includes('8') && (
                <WarnBox>
                  Java 8 e compativel apenas com versoes antigas do Fluig (ate 1.5.x). Upgrade para Java 11 ou 17 fortemente recomendado.
                </WarnBox>
              )}
              {inventory.java_version?.includes('21') && (
                <WarnBox>
                  Java 21 esta em analise pela TOTVS. Nao use em producao sem confirmacao de homologacao.
                </WarnBox>
              )}
              <InfoBox>
                Versoes homologadas: OpenJDK/Oracle JDK/Temurin/Corretto/Zulu 11 e 17. O instalador do Fluig 2.0+ inclui o JDK embutido.
              </InfoBox>
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
              <CardDescription>
                Banco de dados utilizado pelo Fluig. Confira a versao exata — ela impacta diretamente na homologacao.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Tipo e Versao do Banco</Label>
                  <Select value={inventory.database_type} onValueChange={handleDbSelect}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o banco de dados" /></SelectTrigger>
                    <SelectContent>
                      {DB_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Versao Exata</Label>
                  <Input
                    value={inventory.database_version}
                    onChange={(e) => updateInventory('database_version', e.target.value)}
                    placeholder="Ex: 19.3.0.0, 15.0.4198, 8.0.36"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Charset / Character Set</Label>
                  <Input
                    value={inventory.database_charset}
                    onChange={(e) => updateInventory('database_charset', e.target.value)}
                    placeholder="Ex: AL32UTF8, utf8mb4, UTF-8"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Collation</Label>
                  <Input
                    value={inventory.database_collation}
                    onChange={(e) => updateInventory('database_collation', e.target.value)}
                    placeholder="Ex: BINARY, SQL_Latin1_General_CP1_CI_AS"
                    className="mt-1"
                  />
                </div>
              </div>
              {inventory.database_type?.includes('MySQL') && (
                <WarnBox>
                  MySQL 8.0 e homologado a partir do Fluig 1.8.1 (versao minima do MySQL: 8.0.27). Use charset utf8mb4 e collation utf8mb4_general_ci. Nao utilize MySQL 5.x.
                </WarnBox>
              )}
              {inventory.database_type?.includes('PostgreSQL') && (
                <WarnBox>
                  PostgreSQL NAO consta na Matriz de Portabilidade oficial do Fluig. O sistema validara como nao homologado.
                </WarnBox>
              )}
              {inventory.database_type?.includes('2022') && (
                <WarnBox>
                  SQL Server 2022 requer Fluig 2.0 ou superior. Confirme a versao do Fluig informada.
                </WarnBox>
              )}
              <InfoBox>
                Bancos homologados: Oracle 19c, SQL Server 2016/2017/2019/2022 (2022 requer Fluig 2.0+), MySQL 8.0 (requer Fluig 1.8.1+). Charset recomendado para Oracle: AL32UTF8. Para MySQL: utf8mb4.
              </InfoBox>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(5)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={() => setStep(7)}>Proximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 7: Infraestrutura / Proxy */}
        {step === 7 && (
          <Card>
            <CardHeader>
              <CardTitle>Infraestrutura e Reverse Proxy</CardTitle>
              <CardDescription>
                Servidor de aplicacao embutido, Nginx e Apache utilizados como proxy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Servidor de Aplicacao</Label>
                  <Select value={inventory.appserver_type} onValueChange={(v) => updateInventory('appserver_type', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {APPSERVER_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nginx (Reverse Proxy)</Label>
                  <Select value={inventory.nginx_version} onValueChange={(v) => updateInventory('nginx_version', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione ou deixe vazio" /></SelectTrigger>
                    <SelectContent>
                      {NGINX_OPTIONS.map(opt => (
                        <SelectItem key={opt.value || 'none'} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Apache HTTP Server</Label>
                  <Select value={inventory.apache_version} onValueChange={(v) => updateInventory('apache_version', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione ou deixe vazio" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sem Apache</SelectItem>
                      <SelectItem value="Apache HTTP Server 2.4">Apache 2.4 (Homologado)</SelectItem>
                      <SelectItem value="Apache HTTP Server 2.2">Apache 2.2 (Nao homologado)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {inventory.appserver_type?.includes('Tomcat') || inventory.appserver_type?.includes('WebSphere') || inventory.appserver_type?.includes('WebLogic') ? (
                <WarnBox>
                  O Fluig utiliza o JBoss/WildFly embutido no instalador. Servidores de aplicacao externos nao sao suportados e serao marcados como nao homologados.
                </WarnBox>
              ) : null}
              {inventory.nginx_version?.includes('1.24') || inventory.nginx_version?.includes('1.26') || inventory.nginx_version?.includes('1.28') ? (
                <WarnBox>
                  Nginx 1.24+ e incompativel com o modulo nginx-stick-module-ng usado para balanceamento de carga (versao open-source). Avalie o impacto antes de usar em producao com multiplas instancias.
                </WarnBox>
              ) : null}
              <InfoBox>
                O Fluig usa JBoss/WildFly embutido. Nginx 1.22 e a versao mais estavel para uso como proxy. Apache 2.4 tambem e suportado, mas preferentemente em Linux.
              </InfoBox>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(6)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={() => setStep(8)}>Proximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 8: Dimensionamento */}
        {step === 8 && (
          <Card>
            <CardHeader>
              <CardTitle>Simulador de Dimensionamento</CardTitle>
              <CardDescription>
                Baseado no Modelo de Dimensionamento Fluig (TDN). Perfis P/M/G: ate 500 usuarios registrados por modelo padrao.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Selecao de perfil */}
              <div>
                <Label>Perfil de Uso (atalho)</Label>
                <Select value={sizingProfile} onValueChange={handleSizingProfileSelect}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione um perfil ou preencha manualmente" /></SelectTrigger>
                  <SelectContent>
                    {SIZING_PROFILES.map(p => (
                      <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Usuarios Cadastrados</Label>
                  <Input
                    type="number"
                    value={sizing.registered_users}
                    onChange={(e) => updateSizing('registered_users', parseInt(e.target.value) || 0)}
                    className="mt-1"
                    min={0}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Perfil P: ate 100 | M: ate 300 | G: ate 500</p>
                </div>
                <div>
                  <Label>Usuarios Simultaneos (concorrentes)</Label>
                  <Input
                    type="number"
                    value={sizing.concurrent_users}
                    onChange={(e) => updateSizing('concurrent_users', parseInt(e.target.value) || 0)}
                    className="mt-1"
                    min={0}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Perfil P: ate 80 | M: ate 150 | G: ate 220</p>
                </div>
                <div>
                  <Label>Numero de Processos Ativos</Label>
                  <Input
                    type="number"
                    value={sizing.process_count}
                    onChange={(e) => updateSizing('process_count', parseInt(e.target.value) || 0)}
                    className="mt-1"
                    min={0}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Perfil P: ate 5 | M: ate 10 | G: ate 15</p>
                </div>
                <div>
                  <Label>Publicacoes Diarias Esperadas</Label>
                  <Input
                    type="number"
                    value={sizing.dataset_count}
                    onChange={(e) => updateSizing('dataset_count', parseInt(e.target.value) || 0)}
                    className="mt-1"
                    min={0}
                    placeholder="Ex: 300"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Perfil P: ate 300/dia | M: ate 500/dia | G: ate 600/dia</p>
                </div>
                <div>
                  <Label>Volume de Documentos (total)</Label>
                  <Input
                    type="number"
                    value={sizing.doc_volume}
                    onChange={(e) => updateSizing('doc_volume', parseInt(e.target.value) || 0)}
                    className="mt-1"
                    min={0}
                    placeholder="Ex: 50000"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Impacta o calculo de disco</p>
                </div>
                <div>
                  <Label>Integracoes Simultaneas</Label>
                  <Input
                    type="number"
                    value={sizing.integration_volume}
                    onChange={(e) => updateSizing('integration_volume', parseInt(e.target.value) || 0)}
                    className="mt-1"
                    min={0}
                    placeholder="Ex: 10"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Integracoes ativas simultaneamente</p>
                </div>
              </div>

              {isOverSizingLimit && (
                <WarnBox>
                  Os valores informados ultrapassam os limites do modelo padrao (500 usuarios registrados / 220 concorrentes). O dimensionamento requer avaliacao customizada pela TOTVS: TIS.COMERCIAL@totvs.com.br (servidores proprios) ou cloud.projetostecnicos@totvs.com.br (Cloud TOTVS).
                </WarnBox>
              )}

              <InfoBox>
                O modelo oficial usa 8 vCPU e 16 GB RAM por instancia em TODOS os perfis. O que varia e o numero de instancias (P=1, M=2, G=3) e o espaco de disco. O calculo de repositorio e: (qtde docs x tamanho medio x qtde versoes) x 1.10 + cache diario.
              </InfoBox>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(7)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={() => setStep(9)}>Proximo <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 9: Health Check (opcional) */}
        {step === 9 && (
          <Card>
            <CardHeader>
              <CardTitle>Health Check (Opcional)</CardTitle>
              <CardDescription>
                Faca upload do <code className="text-xs">healthcheck.json</code> gerado pelo script ou informe as metricas manualmente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <FileUp className="h-8 w-8 text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium mb-1">Upload do arquivo healthcheck.json</p>
                  <p className="text-xs text-muted-foreground mb-2">Gerado pelo script <code>coleta-healthcheck.sh</code></p>
                  <Input type="file" accept=".json" onChange={handleHealthCheckUpload} className="max-w-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>Heap JVM (%)</Label>
                  <Input
                    type="number"
                    value={healthCheckRaw.heapUsage}
                    onChange={(e) => setHealthCheckRaw(prev => ({ ...prev, heapUsage: e.target.value }))}
                    placeholder="Ex: 65"
                    className="mt-1"
                    min={0}
                    max={100}
                  />
                </div>
                <div>
                  <Label>CPU (%)</Label>
                  <Input
                    type="number"
                    value={healthCheckRaw.cpuUsage}
                    onChange={(e) => setHealthCheckRaw(prev => ({ ...prev, cpuUsage: e.target.value }))}
                    placeholder="Ex: 45"
                    className="mt-1"
                    min={0}
                    max={100}
                  />
                </div>
                <div>
                  <Label>Memoria (%)</Label>
                  <Input
                    type="number"
                    value={healthCheckRaw.memoryUsage}
                    onChange={(e) => setHealthCheckRaw(prev => ({ ...prev, memoryUsage: e.target.value }))}
                    placeholder="Ex: 70"
                    className="mt-1"
                    min={0}
                    max={100}
                  />
                </div>
                <div>
                  <Label>Disco (%)</Label>
                  <Input
                    type="number"
                    value={healthCheckRaw.diskUsage}
                    onChange={(e) => setHealthCheckRaw(prev => ({ ...prev, diskUsage: e.target.value }))}
                    placeholder="Ex: 55"
                    className="mt-1"
                    min={0}
                    max={100}
                  />
                </div>
              </div>
              <InfoBox>
                O Health Check e opcional. Sem ele a analise de compatibilidade e dimensionamento funcionam normalmente. As metricas coletadas ajudam a IA a identificar problemas de desempenho em tempo real.
              </InfoBox>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(8)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
                <Button onClick={handleRunAnalysis} disabled={isLoading} size="lg">
                  {isLoading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analisando...</>
                    : <><CheckCircle2 className="mr-2 h-4 w-4" /> Executar Analise</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
