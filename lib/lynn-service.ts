const LYNN_AGENT_URL = process.env.LYNN_API_URL!;
const LYNN_API_KEY = process.env.LYNN_API_KEY!;
const LYNN_FETCH_TIMEOUT_MS = 120_000;

interface LynnFinding {
  category: string;
  severity: string;
  root_cause: string;
  evidence: string;
  suggested_actions: string[];
  confidence: string;
  requires_additional_logs: boolean;
  scenario: string | null;
  observation: string | null;
}

interface LynnSpecialist {
  agent: string;
  type: string;
  summary: string;
  findings: LynnFinding[];
}

interface LynnAgentResponse {
  format_version?: string;
  has_question?: boolean;
  question?: string | null;
  message: string;
  specialists?: LynnSpecialist[];
}

export function assertLynnConfigured(): void {
  if (!LYNN_AGENT_URL || !LYNN_API_KEY) {
    throw new Error(
      'A IA LYNN está indisponível porque as variáveis LYNN_API_URL ou LYNN_API_KEY não estão configuradas.'
    );
  }
}

function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

function tryJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Recursively searches through an unknown value for a LynnAgentResponse.
 * Handles direct objects, string-encoded JSON, and arbitrarily nested wrappers.
 */
function tryParseLynnAgent(data: unknown, depth = 0): LynnAgentResponse | null {
  if (depth > 5) return null;

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;

    // Direct Lynn agent format
    if (
      typeof obj.message === 'string' &&
      (obj.specialists !== undefined || obj.format_version !== undefined)
    ) {
      return obj as unknown as LynnAgentResponse;
    }

    // Recurse into every value — handles string-encoded JSON and nested objects
    for (const val of Object.values(obj)) {
      if (typeof val === 'string') {
        const parsed = tryJsonParse(val);
        if (parsed !== null) {
          const found = tryParseLynnAgent(parsed, depth + 1);
          if (found) return found;
        }
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        const found = tryParseLynnAgent(val, depth + 1);
        if (found) return found;
      }
    }

    return null;
  }

  if (typeof data === 'string') {
    const parsed = tryJsonParse(data);
    if (parsed !== null) return tryParseLynnAgent(parsed, depth + 1);
  }

  return null;
}

// ─── Human-readable markdown (for chat) ──────────────────────────────────────

function buildTextFromAgentJson(agent: LynnAgentResponse): string {
  const parts: string[] = [agent.message];

  const specialists = agent.specialists || [];
  if (specialists.length === 0) return agent.message;

  const allFindings = specialists.flatMap((s) => s.findings || []);
  if (allFindings.length === 0) return agent.message;

  const severityLabel: Record<string, string> = {
    high: 'Alta',
    medium: 'Media',
    low: 'Baixa',
    critical: 'Critica',
  };

  const categoryLabel: Record<string, string> = {
    database: 'Banco de Dados',
    workflow: 'BPM / Workflow',
    performance: 'Performance',
    network: 'Rede / Conectividade',
    infrastructure: 'Infraestrutura',
    integration: 'Integracao',
    security: 'Seguranca',
    installation: 'Instalacao',
    other: 'Geral',
  };

  const diagBlocks: string[] = [];
  const allActions: string[] = [];

  allFindings.forEach((finding) => {
    const cat =
      categoryLabel[finding.category?.toLowerCase()] ?? finding.category ?? 'Geral';
    const sev = severityLabel[finding.severity?.toLowerCase()] ?? finding.severity ?? '';
    const header = sev ? `## ${cat} — Severidade: ${sev}` : `## ${cat}`;

    const block: string[] = [header];
    if (finding.root_cause) block.push(`**Causa raiz:** ${finding.root_cause}`);
    if (finding.evidence) block.push(`**Evidencia:** ${finding.evidence}`);

    diagBlocks.push(block.join('\n'));

    (finding.suggested_actions || []).forEach((action) => {
      if (!allActions.includes(action)) allActions.push(action);
    });
  });

  if (diagBlocks.length > 0) {
    parts.push('', '## Diagnostico', '', diagBlocks.join('\n\n'));
  }

  if (allActions.length > 0) {
    parts.push('', '## Acoes sugeridas', '');
    allActions.forEach((action) => parts.push(`- ${action}`));
  }

  return parts.join('\n');
}

// ─── Structured JSON response (for regenerate-summary) ───────────────────────

function buildResponseFromAgentJson(agent: LynnAgentResponse): string {
  const allSuggestions: string[] = [];
  const errorAnalysis: { errorId: string; suggestion: string }[] = [];

  (agent.specialists || []).forEach((specialist) => {
    (specialist.findings || []).forEach((finding, idx) => {
      (finding.suggested_actions || []).forEach((action) => {
        if (!allSuggestions.includes(action)) allSuggestions.push(action);
      });

      if (finding.root_cause || finding.evidence) {
        errorAnalysis.push({
          errorId: String(idx),
          suggestion: [
            finding.root_cause,
            finding.evidence ? `Evidência: ${finding.evidence}` : '',
          ]
            .filter(Boolean)
            .join(' | '),
        });
      }
    });
  });

  // Use the full formatted text as the summary so the card shows a rich report
  const richSummary = buildTextFromAgentJson(agent);

  return JSON.stringify({
    summary: richSummary,
    suggestions: allSuggestions.slice(0, 8),
    errorAnalysis,
  });
}

// ─── Fallback extractor for non-Lynn API responses ───────────────────────────

function extractLynnText(data: unknown): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.content === 'string') return obj.content;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.answer === 'string') return obj.answer;
    if (typeof obj.response === 'string') return obj.response;

    // OpenAI-compatible shape
    if (Array.isArray(obj.choices) && obj.choices.length > 0) {
      const choice = obj.choices[0] as Record<string, unknown>;
      const msg = choice.message as Record<string, unknown> | undefined;
      if (msg && typeof msg.content === 'string') return msg.content;
    }

    const first = Object.values(obj).find((v) => typeof v === 'string');
    if (first) return first as string;
  }
  return JSON.stringify(data);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function callLynn(content: string): Promise<string> {
  assertLynnConfigured();

  const response = await fetchWithTimeout(
    LYNN_AGENT_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dta-api-key': LYNN_API_KEY,
      },
      body: JSON.stringify({ content }),
    },
    LYNN_FETCH_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`LYNN API error ${response.status}: ${errorText}`);
  }

  // Use text() for full control — avoids Content-Type mismatches and double-serialized bodies
  const rawText = await response.text();
  const parsed = tryJsonParse(rawText);
  const agent = tryParseLynnAgent(parsed ?? rawText);

  if (agent) return buildResponseFromAgentJson(agent);

  // Non-Lynn JSON: extract the most meaningful string value
  if (parsed && typeof parsed === 'object') return extractLynnText(parsed);

  return rawText;
}

export async function callLynnStream(content: string): Promise<ReadableStream<Uint8Array>> {
  const responseText = await callLynn(content);
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(responseText));
      controller.close();
    },
  });
}

export function parseLynnJsonResponse<T>(text: string): T {
  const cleaned = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }
    throw new Error(
      `Não foi possível extrair JSON da resposta LYNN: ${cleaned.substring(0, 200)}`
    );
  }
}

export async function callLynnStreamChat(
  content: string
): Promise<ReadableStream<Uint8Array>> {
  assertLynnConfigured();

  const response = await fetchWithTimeout(
    LYNN_AGENT_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dta-api-key': LYNN_API_KEY,
      },
      body: JSON.stringify({ content }),
    },
    LYNN_FETCH_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`LYNN API error ${response.status}: ${errorText}`);
  }

  const rawText = await response.text();
  const parsed = tryJsonParse(rawText);
  const agent = tryParseLynnAgent(parsed ?? rawText);

  // For chat: always produce human-readable markdown
  let text: string;
  if (agent) {
    text = buildTextFromAgentJson(agent);
  } else if (parsed && typeof parsed === 'object') {
    text = extractLynnText(parsed);
  } else {
    text = rawText;
  }

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}
