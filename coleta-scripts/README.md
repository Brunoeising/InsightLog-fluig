# Scripts de Coleta - InsightLog Environment Analyzer

Estes scripts coletam informacoes do servidor onde o Fluig esta instalado e geram arquivos JSON para upload no InsightLog.

> **Execute sempre no servidor de APLICACAO do Fluig** — nao no servidor de banco de dados.

## Arquivos

| Script | Plataforma | Saida |
|--------|------------|-------|
| `coleta-linux.sh` | Linux (RHEL, CentOS, Oracle Linux, Ubuntu) | `inventario.json` |
| `coleta-windows.ps1` | Windows Server (PowerShell 5.1+) | `inventario.json` |
| `coleta-healthcheck.sh` | Linux | `healthcheck.json` |

---

## Como Usar

### Linux

```bash
chmod +x coleta-linux.sh
./coleta-linux.sh
```

Para o health check (execute com o Fluig em execucao):

```bash
chmod +x coleta-healthcheck.sh
./coleta-healthcheck.sh
```

### Windows

```powershell
# Se necessario, libere a execucao na sessao atual:
Set-ExecutionPolicy -Scope Process Bypass

.\coleta-windows.ps1
```

---

## O que e Coletado

### `coleta-linux.sh` / `coleta-windows.ps1` — Inventario

| Campo | Descricao |
|-------|-----------|
| `os_name` | Nome completo do SO (ex: Red Hat Enterprise Linux) |
| `os_version` | Versao do SO (ex: 8.7) |
| `os_build` | Kernel/Build Number |
| `architecture` | Arquitetura (x86_64) |
| `cpu_vcpu` | Numero de vCPUs logicos |
| `ram_gb` | Memoria RAM total em GB |
| `disk_gb` | Espaco em disco da particao principal em GB |
| `java_version` | Vendor + Versao Java (ex: OpenJDK 17.0.10) |
| `java_vendor` | Vendor do Java (OpenJDK, Oracle, Temurin, etc.) |
| `java_home` | Caminho do JAVA_HOME |
| `fluig_version` | Versao do Fluig (ex: 1.8.1, 2.0.0) |
| `fluig_patch` | Ultimo patch/HF aplicado |
| `fluig_directory` | Diretorio de instalacao do Fluig |
| `database_type` | Tipo e versao do banco (ex: Oracle 19c, MySQL 8.0) |
| `database_charset` | Charset do banco |
| `database_collation` | Collation do banco |
| `appserver_type` | Servidor de aplicacao (JBoss embutido) |
| `nginx_version` | Versao do Nginx (se instalado) |
| `apache_version` | Versao do Apache HTTP Server (se instalado) |

### `coleta-healthcheck.sh` — Metricas de Saude

| Campo | Descricao |
|-------|-----------|
| `heap_usage` | Uso de heap JVM em % (via jstat ou estimativa) |
| `cpu_usage` | Uso de CPU do processo Fluig/JBoss em % |
| `memory_usage` | Uso de memoria do processo em % |
| `disk_usage` | Uso de disco da particao principal em % |
| `services_status` | Status dos servicos (fluig, appserver, nginx, apache) |
| `host_xml_heap_max` | Configuracao -Xmx encontrada no host.xml |
| `host_xml_heap_init` | Configuracao -Xms encontrada no host.xml |

---

## Permissoes Necessarias

- **Linux**: usuario com acesso de leitura ao sistema de arquivos e ao `/proc`
- **Windows**: usuario com acesso de leitura ao registro e ao sistema de arquivos
- **jstat** (opcional, para heap): requer que o usuario seja o mesmo que iniciou o JVM do Fluig, ou root

---

## Matriz de Portabilidade — Referencia Rapida

Os scripts coletam os dados que serao validados contra a [Matriz de Portabilidade Fluig (TDN)](https://tdn.totvs.com/display/public/fluig/Matriz+de+portabilidade).

**SOs Homologados:** RHEL 6.x-8.x, Oracle Linux 6.x-8.x, CentOS 6.x-7.x, Ubuntu Server 16.04-22.04, Windows Server 2016/2019  
**SOs com Restricao (requerem Fluig 2.0+):** RHEL 9.x, Oracle Linux 9.x, Ubuntu 24.04, Windows Server 2022  
**Java Homologado:** OpenJDK/Oracle/Temurin/Corretto/Zulu 11 e 17  
**Bancos Homologados:** Oracle 19c, SQL Server 2016/2017/2019/2022*, MySQL 8.0*  
**Nginx:** 1.22 (homologado). 1.24/1.26/1.28 incompativeis com nginx-stick-module-ng (load balancer open-source)  
**Dimensionamento Padrao:** 8 vCPU + 16 GB RAM por instancia, perfis P (1 inst.) / M (2 inst.) / G (3 inst.)

> * SQL Server 2022 e MySQL 8.0 requerem Fluig 1.8.1+ (MySQL) ou 2.0+ (SQL Server 2022)

---

## Apos a Coleta

1. Copie `inventario.json` (e opcionalmente `healthcheck.json`) para sua maquina
2. No InsightLog, acesse **Analise de Ambiente → Nova Analise**
3. Faca upload do `inventario.json` na tela de importacao
4. Revise/complete os campos e execute a analise
5. O sistema valida contra a Matriz de Portabilidade e calcula o dimensionamento

---

## Seguranca

- Os scripts **nao enviam dados** para nenhum servidor automaticamente
- **Nenhuma credencial, senha ou dado sensivel** e coletado
- Os arquivos JSON gerados contem apenas informacoes tecnicas de versao e configuracao
