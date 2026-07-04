const LYNN_API_URL = process.env.LYNN_API_URL!;
const LYNN_API_KEY = process.env.LYNN_API_KEY!;

function getLynnHeaders(sessionId?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${LYNN_API_KEY}`,
    Accept: 'application/json, text/plain, */*',
  };
  if (sessionId) {
    headers['x-dta-session-id'] = sessionId;
  }
  return headers;
}

export function assertLynnConfigured(): void {
  if (!LYNN_API_URL || !LYNN_API_KEY) {
    throw new Error('A IA LYNN está indisponível porque as variáveis LYNN_API_URL ou LYNN_API_KEY não estão configuradas.');
  }
}

export async function callLynn(content: string, sessionId?: string): Promise<string> {
  assertLynnConfigured();

  const response = await fetch(LYNN_API_URL, {
    method: 'POST',
    headers: getLynnHeaders(sessionId),
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`LYNN API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return extractLynnText(data);
}

export async function callLynnStream(content: string, sessionId?: string): Promise<ReadableStream<Uint8Array>> {
  assertLynnConfigured();

  const response = await fetch(LYNN_API_URL, {
    method: 'POST',
    headers: getLynnHeaders(sessionId),
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`LYNN API error ${response.status}: ${errorText}`);
  }

  const responseText = extractLynnText(await response.json());
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(responseText));
      controller.close();
    },
  });
}

export function parseLynnJsonResponse<T>(text: string): T {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }
    throw new Error(`Não foi possível extrair JSON da resposta LYNN: ${cleaned.substring(0, 200)}`);
  }
}

function extractLynnText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.content === 'string') return obj.content;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.answer === 'string') return obj.answer;
    if (typeof obj.response === 'string') return obj.response;
    const firstStringValue = Object.values(obj).find((v) => typeof v === 'string');
    if (firstStringValue) return firstStringValue as string;
  }
  return JSON.stringify(data);
}
