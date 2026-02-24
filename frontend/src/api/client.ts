import type {
  Lorebook,
  LorebookDetail,
  Entry,
  EntryCreate,
  EntryUpdate,
  ImageAsset,
  ImageDetail,
  SessionSummary,
  SessionDetail,
  ConjureParams,
  GenerateImageParams,
  PublicLorebook,
  ImportResult,
  CrossoverProposal,
  CrossoverResult,
  LorebookValidation,
  SSEEvent,
} from './types';

const RAW_API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_BASE = RAW_API_BASE.replace(/\/$/, '');
const API_PREFIX = API_BASE.endsWith('/api') ? '' : '/api';

const buildApiUrl = (path: string): string => `${API_BASE}${API_PREFIX}${path}`;

type TokenProvider = () => Promise<string | null>;
type UnauthorizedHandler = () => void;

let tokenProvider: TokenProvider | null = null;
let unauthorizedHandler: UnauthorizedHandler | null = null;

interface SSEOptions {
  onOpen?: (response: Response) => void;
}

export function setAuthTokenProvider(provider: TokenProvider | null) {
  tokenProvider = provider;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

async function buildHeaders(initialHeaders?: HeadersInit): Promise<Headers> {
  const headers = new Headers(initialHeaders || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (tokenProvider) {
    const token = await tokenProvider();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Type A — standard fetch
// ---------------------------------------------------------------------------

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await buildHeaders(options?.headers);
  const restOptions: RequestInit = options ? { ...options, headers: undefined } : {};

  const response = await fetch(buildApiUrl(path), {
    ...restOptions,
    headers,
  });

  if (response.status === 401) {
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

// Lorebooks
export async function listLorebooks(): Promise<Lorebook[]> {
  return fetchApi<Lorebook[]>('/lorebooks');
}

export async function getLorebook(id: string): Promise<LorebookDetail> {
  return fetchApi<LorebookDetail>(`/lorebooks/${id}`);
}

export async function updateLorebookMeta(
  lorebookId: string,
  data: { title?: string; description?: string },
): Promise<void> {
  await fetchApi<void>(`/lorebooks/${lorebookId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function updateEntry(
  lorebookId: string,
  entryId: string,
  data: EntryUpdate,
): Promise<Entry> {
  return fetchApi<Entry>(`/lorebooks/${lorebookId}/entries/${entryId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function createEntry(
  lorebookId: string,
  data: EntryCreate,
): Promise<Entry> {
  return fetchApi<Entry>(`/lorebooks/${lorebookId}/entries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteEntry(
  lorebookId: string,
  entryId: string,
): Promise<void> {
  await fetchApi<void>(`/lorebooks/${lorebookId}/entries/${entryId}`, {
    method: 'DELETE',
  });
}

export async function validateLorebook(
  lorebookId: string,
): Promise<LorebookValidation> {
  return fetchApi<LorebookValidation>(`/lorebooks/${lorebookId}/validate`, {
    method: 'POST',
  });
}

// Gallery
export async function listImages(
  filters?: { asset_type?: string },
): Promise<ImageAsset[]> {
  const params = new URLSearchParams();
  if (filters?.asset_type) params.set('asset_type', filters.asset_type);
  const qs = params.toString();
  return fetchApi<ImageAsset[]>(`/gallery${qs ? `?${qs}` : ''}`);
}

export async function getImage(id: string): Promise<ImageDetail> {
  return fetchApi<ImageDetail>(`/gallery/${id}`);
}

// Sessions
export async function listSessions(): Promise<SessionSummary[]> {
  return fetchApi<SessionSummary[]>('/sessions');
}

export async function getSession(id: string): Promise<SessionDetail> {
  return fetchApi<SessionDetail>(`/sessions/${id}`);
}

// Collaboration
export async function listPublicLorebooks(): Promise<PublicLorebook[]> {
  return fetchApi<PublicLorebook[]>('/collaboration/public');
}

export async function importLorebook(
  lorebookId: string,
): Promise<ImportResult> {
  return fetchApi<ImportResult>('/collaboration/import', {
    method: 'POST',
    body: JSON.stringify({ lorebook_id: lorebookId }),
  });
}

export async function proposeCrossover(
  source: string,
  target: string,
  names: string[],
): Promise<CrossoverProposal> {
  return fetchApi<CrossoverProposal>('/collaboration/crossover', {
    method: 'POST',
    body: JSON.stringify({ source_lorebook_id: source, target_lorebook_id: target, character_names: names }),
  });
}

export async function acceptCrossover(
  proposal: CrossoverProposal,
): Promise<CrossoverResult> {
  return fetchApi<CrossoverResult>('/collaboration/crossover/accept', {
    method: 'POST',
    body: JSON.stringify(proposal),
  });
}

// ---------------------------------------------------------------------------
// Type B — SSE streaming
// ---------------------------------------------------------------------------

export async function* streamSSE(
  path: string,
  body: object,
  options?: SSEOptions,
): AsyncGenerator<SSEEvent> {
  const headers = await buildHeaders({ 'Content-Type': 'application/json' });

  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text}`);
  }

  options?.onOpen?.(response);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        yield JSON.parse(line.slice(6)) as SSEEvent;
      }
    }
  }
}

export function conjureSession(params: ConjureParams, options?: SSEOptions) {
  return streamSSE('/sessions/conjure', params, options);
}

export function sendMessage(sessionId: string, text: string) {
  return streamSSE(`/sessions/${sessionId}/message`, { text });
}

export function generateImage(params: GenerateImageParams) {
  return streamSSE('/images/generate', params);
}

export function enrichEntry(lorebookId: string, entryId: string, task: string) {
  return streamSSE(`/lorebooks/${lorebookId}/entries/${entryId}/enrich`, { task });
}
