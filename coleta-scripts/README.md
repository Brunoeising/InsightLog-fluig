# Scripts de Coleta - InsightLog Environment Analyzer

Estes scripts coletam informacoes do servidor onde o Fluig esta instalado e geram arquivos JSON que devem ser enviados para o app InsightLog para analise.

## Arquivos

| Script | Plataforma | Saida |
|--------|-----------|-------|
| `coleta-linux.sh` | Linux | `inventario.json` |
| `coleta-windows.ps1` | Windows (PowerShell) | `inventario.json` |
| `coleta-healthcheck.sh` | Linux | `healthcheck.json` |

## Como Usar

### Linux

```bash
chmod +x coleta-linux.sh
./coleta-linux.sh
```

Para o health check:

```bash
chmod +x coleta-healthcheck.sh
./coleta-healthcheck.sh
```

### Windows

```powershell
.\coleta-windows.ps1
```

## Permissoes Necessarias

- Acesso de leitura ao sistema de arquivos
- Comando `java` disponivel no PATH
- Comando `jstat` disponivel (para heap metrics)
- Acesso aos servicos do Fluig (systemctl / service)

## Apos a Coleta

1. Envie o arquivo `inventario.json` (e opcionalmente `healthcheck.json`) para o InsightLog
2. No app, acesse "Analise de Ambiente" > "Nova Analise"
3. Faca upload do arquivo JSON ou preencha o formulario manualmente
4. O sistema validara contra a matriz de portabilidade e calculara o dimensionamento

## Importante

- Os scripts nao enviam dados automaticamente para nenhum servidor
- Os arquivos JSON gerados contem apenas informacoes tecnicas do ambiente
- Nenhuma credencial ou dado sensivel e coletado
