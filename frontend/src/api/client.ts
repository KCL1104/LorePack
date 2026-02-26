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
  ExampleStorySeed,
  GenerateImageParams,
  PublicLorebook,
  ImportResult,
  CrossoverProposal,
  CrossoverResult,
  LorebookValidation,
  SSEEvent,
  A2AAgent,
  RemoteAgentCard,
  A2AInteractionResult,
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
  filters?: { asset_type?: string; lorebook_id?: string; include_signed_url?: boolean },
): Promise<ImageAsset[]> {
  const params = new URLSearchParams();
  if (filters?.asset_type) params.set('asset_type', filters.asset_type);
  if (filters?.lorebook_id) params.set('lorebook_id', filters.lorebook_id);
  if (filters?.include_signed_url) params.set('include_signed_url', 'true');
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

export async function listExampleStories(): Promise<ExampleStorySeed[]> {
  return fetchApi<ExampleStorySeed[]>('/sessions/examples');
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
  const CONNECT_RETRY_DELAYS_MS = [700, 1400];
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, ms);
    });

  const parseSSEBlock = (block: string): SSEEvent[] => {
    const dataLines = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, ''));

    if (dataLines.length === 0) return [];

    const payload = dataLines.join('\n').trim();
    if (!payload) return [];

    try {
      const parsed = JSON.parse(payload) as SSEEvent;
      if (!parsed?.type) {
        return [{ type: 'error', message: 'Malformed SSE event (missing type).', retryable: false }];
      }
      return [parsed];
    } catch {
      return [{ type: 'error', message: 'Malformed SSE payload received.', retryable: false }];
    }
  };

  const headers = await buildHeaders({ 'Content-Type': 'application/json' });
  let response: Response | null = null;
  let connectError: unknown;

  for (let attempt = 0; attempt <= CONNECT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      response = await fetch(buildApiUrl(path), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      break;
    } catch (err) {
      connectError = err;
      if (attempt >= CONNECT_RETRY_DELAYS_MS.length) {
        break;
      }
      await wait(CONNECT_RETRY_DELAYS_MS[attempt]);
    }
  }

  if (!response) {
    const message = connectError instanceof Error ? connectError.message : 'Unable to connect to stream.';
    throw new Error(`SSE connection failed: ${message}`);
  }

  if (response.status === 401) {
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text}`);
  }

  options?.onOpen?.(response);

  if (!response.body) {
    throw new Error('SSE response stream was unavailable.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        const events = parseSSEBlock(block);
        for (const event of events) {
          yield event;
        }
      }
    }

    if (buffer.trim()) {
      const trailingEvents = parseSSEBlock(buffer);
      for (const event of trailingEvents) {
        yield event;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown streaming error.';
    throw new Error(`SSE stream interrupted: ${message}`);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // no-op
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

// ---------------------------------------------------------------------------
// A2A endpoints
// ---------------------------------------------------------------------------

export async function listA2AAgents(): Promise<A2AAgent[]> {
  return fetchApi<A2AAgent[]>('/a2a/agents');
}

export async function syncA2AAgents(): Promise<{ registered: number; unregistered: number; total_active: number }> {
  return fetchApi('/a2a/sync', { method: 'POST' });
}

export async function discoverRemoteAgent(url: string): Promise<RemoteAgentCard> {
  return fetchApi<RemoteAgentCard>('/a2a/discover', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export async function sendA2AMessage(
  agentUrl: string,
  message: string,
): Promise<A2AInteractionResult> {
  return fetchApi<A2AInteractionResult>('/a2a/interact', {
    method: 'POST',
    body: JSON.stringify({ agent_url: agentUrl, message }),
  });
}
