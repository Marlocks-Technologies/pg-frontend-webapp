const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://yvf4p3dpp7.execute-api.eu-west-1.amazonaws.com/dev';

const DOCUMENT_URL = process.env.NEXT_PUBLIC_DOCUMENT_BASE_URL || 'https://lh8dbbvwbb.execute-api.eu-west-1.amazonaws.com/dev';

// ── The fix: async function that AWAITS fetch before passing to handler ────────
async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface Citation {
  source: string;
  content?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

// ─── 1. Chat Query  POST /chat/query ─────────────────────────────────────────
//
// Three supported call shapes:
//   Simple:   { question, sessionId }
//   Options:  { question, sessionId, topK, useHistory, filters }
//   Follow-up: { question, sessionId }  ← same as simple; server uses history

export interface ChatQueryRequest {
  question: string;
  sessionId: string;
  topK?: number;
  useHistory?: boolean;
  filters?: Record<string, string>;
}

export interface ChatQueryResponse {
  answer: string;
  citations: Citation[];
  metadata?: {
    chunks_retrieved?: number;
    model?: string;
    processing_time_ms?: number;
  };
}

export async function chatQuery(
  payload: ChatQueryRequest
): Promise<ChatQueryResponse> {
  // Only include optional fields when explicitly provided
  const body: Record<string, unknown> = {
    question: payload.question,
    sessionId: payload.sessionId,
  };
  if (payload.topK !== undefined)      body.topK      = payload.topK;
  if (payload.useHistory !== undefined) body.useHistory = payload.useHistory;
  if (payload.filters !== undefined)   body.filters   = payload.filters;

  const res = await fetch(`${BASE_URL}/chat/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<ChatQueryResponse>(res);
}

// ─── 2. Document Search  POST /chat/search ────────────────────────────────────

export interface SearchRequest {
  query: string;
  topK?: number;
  filters?: Record<string, string>;
}

export interface SearchResult {
  content: string;
  score: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}

export async function documentSearch(
  payload: SearchRequest
): Promise<SearchResponse> {
  const res = await fetch(`${BASE_URL}/chat/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<SearchResponse>(res);
}

// ─── 3. Chat History  GET /chat/history/:sessionId ───────────────────────────

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: {
    citations?: Citation[];
    chunks_retrieved?: number;
  };
}

export interface HistoryResponse {
  messages: HistoryMessage[];
  count: number;
  sessionId: string;
}

export async function getChatHistory(
  sessionId: string
): Promise<HistoryResponse> {
  const res = await fetch(`${BASE_URL}/chat/history/${sessionId}`);
  return handleResponse<HistoryResponse>(res);
}

// ─── 4. Upload Document  POST /documents ─────────────────────────────────────

export interface UploadDocumentRequest {
  filename: string;
  content: string;
  metadata?: Record<string, string>;
}

export interface UploadDocumentResponse {
  documentId: string;
  uploadUrl?: string;  // S3 presigned URL if returned
  status: string;
}

export async function uploadDocument(
  payload: UploadDocumentRequest
): Promise<UploadDocumentResponse> {
  const res = await fetch(`${DOCUMENT_URL}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<UploadDocumentResponse>(res);
}

// ─── 5. List Documents  GET /documents ───────────────────────────────────────

export interface DocumentSummary {
  documentId: string;
  filename: string;
  category?: string;
  uploadTime: string;
  size?: number;
  status?: string;
}

export interface ListDocumentsResponse {
  documents: DocumentSummary[];
  total?: number;
}

export async function listDocuments(): Promise<ListDocumentsResponse> {
  const res = await fetch(`${DOCUMENT_URL}/documents`);
  return handleResponse<ListDocumentsResponse>(res);
}

// ─── 6. Get Document Details  GET /documents/:documentId ─────────────────────

export interface DocumentDetail extends DocumentSummary {
  chunkCount?: number;
  storageLocation?: string;
  metadata?: Record<string, unknown>;
}

export async function getDocumentDetails(
  documentId: string
): Promise<DocumentDetail> {
  const res = await fetch(`${DOCUMENT_URL}/documents/${documentId}`);
  return handleResponse<DocumentDetail>(res);
}

// ─── 7. Delete Document  DELETE /documents/:documentId ───────────────────────

export interface DeleteDocumentResponse {
  success: boolean;
  documentId: string;
}

export async function deleteDocument(
  documentId: string
): Promise<DeleteDocumentResponse> {
  const res = await fetch(`${DOCUMENT_URL}/documents/${documentId}`, {
    method: 'DELETE',
  });
  return handleResponse<DeleteDocumentResponse>(res);
}