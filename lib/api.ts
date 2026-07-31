const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://r17l0a5vbi.execute-api.eu-west-1.amazonaws.com/prod';

const DOCUMENT_URL =
  process.env.NEXT_PUBLIC_DOCUMENT_BASE_URL ||
  BASE_URL;

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
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

// ─── Generated document artifacts ─────────────────────────────────────────────

export interface ArtifactStyleReference {
  documentId: string;
  filename?: string;
  nativeTemplateApplied?: boolean;
}

export interface GeneratedArtifact {
  artifactId: string;
  filename: string;
  format: string;                 // "docx" | "pdf" | "pptx" | "xlsx"
  mimeType?: string;
  sizeBytes?: number;
  title?: string;
  generatedAt?: string;
  styleReference?: ArtifactStyleReference;
  downloadUrl?: string;           // short-lived signed URL
  downloadPath?: string;          // stable path, e.g. /documents/generated/{id}/download
  downloadExpiresAt?: string;
}

/** Stable download route — refreshes the S3 signature and 302-redirects. */
export function artifactDownloadUrl(artifactId: string): string {
  return `${BASE_URL}/documents/generated/${encodeURIComponent(artifactId)}/download`;
}

// ─── 1. Health Check  GET /health ────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  phase: string;
  features: string[];
  requestId?: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE_URL}/health`);
  return handleResponse<HealthResponse>(res);
}

// ─── 2. Chat Query  POST /chat/query ─────────────────────────────────────────

export interface GenerateDocumentOptions {
  format?: string;                // "docx" | "pdf" | "pptx" | "xlsx" — omit for auto
  referenceDocumentId?: string;
  topK?: number;
}

export interface ChatQueryRequest {
  question: string;
  sessionId: string;
  topK?: number;
  useHistory?: boolean;
  filters?: Record<string, string>;
  generateDocument?: GenerateDocumentOptions;
}

export interface ChatQueryResponse {
  answer: string;
  citations: Citation[];
  artifact?: GeneratedArtifact;
  metadata?: {
    chunks_retrieved?: number;
    chunksRetrieved?: number;     // generation responses use camelCase
    model?: string;
    processing_time_ms?: number;
  };
}

export async function chatQuery(
  payload: ChatQueryRequest
): Promise<ChatQueryResponse> {
  const body: Record<string, unknown> = {
    question: payload.question,
    sessionId: payload.sessionId,
  };
  if (payload.topK !== undefined)             body.topK             = payload.topK;
  if (payload.useHistory !== undefined)       body.useHistory       = payload.useHistory;
  if (payload.filters !== undefined)          body.filters          = payload.filters;
  if (payload.generateDocument !== undefined) body.generateDocument = payload.generateDocument;

  const res = await fetch(`${BASE_URL}/chat/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<ChatQueryResponse>(res);
}

// ─── 3. Document Search  POST /chat/search ────────────────────────────────────

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

// ─── 4. Chat History  GET /chat/history/:sessionId ───────────────────────────

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

// ─── 5. Delete Chat Session  DELETE /chat/session/:sessionId ─────────────────

export interface DeleteSessionResponse {
  success: boolean;
  sessionId: string;
  messagesDeleted: number;
  requestId?: string;
}

export async function deleteSession(
  sessionId: string
): Promise<DeleteSessionResponse> {
  const res = await fetch(`${BASE_URL}/chat/session/${sessionId}`, {
    method: 'DELETE',
  });
  return handleResponse<DeleteSessionResponse>(res);
}

// ─── 6. Upload Document  POST /documents ─────────────────────────────────────
//
// content must be standard base64 — the server decodes and extracts text itself.

export interface UploadDocumentRequest {
  filename: string;
  content: string;          // base64-encoded file bytes
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface UploadDocumentResponse {
  documentId: string;
  uploadUrl?: string;
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

// ─── 7. Camera/video capture  POST /documents/capture ─────────────────────────

export type CaptureSourceType = 'camera' | 'video';

export interface CaptureFrame {
  content: string;
  contentType: 'image/jpeg' | 'image/png';
  capturedAt?: string;
}

export interface CaptureDocumentRequest {
  filename: string;
  sourceType: CaptureSourceType;
  frames: CaptureFrame[];
  metadata?: Record<string, string>;
}

export interface CaptureDocumentResponse {
  success: boolean;
  documentId: string;
  filename: string;
  status: 'processing';
  capture: {
    sourceType: CaptureSourceType;
    framesAccepted: number;
    decodedBytes: number;
  };
  message: string;
  requestId?: string;
}

export async function captureDocument(
  payload: CaptureDocumentRequest
): Promise<CaptureDocumentResponse> {
  const res = await fetch(`${DOCUMENT_URL}/documents/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<CaptureDocumentResponse>(res);
}

// ─── 8. List Documents  GET /documents ───────────────────────────────────────

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
  const payload = await handleResponse<{
    documents?: Array<{
      documentId: string;
      filename: string;
      category?: string;
      status?: string;
      uploadedAt?: string;
      processedAt?: string;
      sizeBytes?: number;
    }>;
    count?: number;
  }>(res);

  return {
    documents: (payload.documents ?? []).map(document => ({
      documentId: document.documentId,
      filename: document.filename,
      category: document.category,
      status: document.status,
      uploadTime: document.uploadedAt ?? document.processedAt ?? '',
      size: document.sizeBytes,
    })),
    total: payload.count,
  };
}

// ─── 9. Get Document Details  GET /documents/:documentId ─────────────────────

export interface DocumentDetail extends DocumentSummary {
  chunkCount?: number;
  storageLocation?: string;
  metadata?: Record<string, unknown>;
}

export async function getDocumentDetails(
  documentId: string
): Promise<DocumentDetail> {
  const res = await fetch(`${DOCUMENT_URL}/documents/${documentId}`);
  const payload = await handleResponse<{
    document: {
      documentId: string;
      filename: string;
      category?: string;
      status?: string;
      uploadedAt?: string;
      processedAt?: string;
      sizeBytes?: number;
      s3Uri?: string;
      secondaryTags?: string[];
      confidence?: number;
      contentType?: string;
      checksum?: string;
      processing?: Record<string, unknown>;
      vectors?: { count?: number; bucket?: string };
    };
  }>(res);
  const document = payload.document;

  return {
    documentId: document.documentId,
    filename: document.filename,
    category: document.category,
    status: document.status,
    uploadTime: document.uploadedAt ?? document.processedAt ?? '',
    size: document.sizeBytes,
    chunkCount: document.vectors?.count,
    storageLocation: document.s3Uri,
    metadata: {
      secondaryTags: document.secondaryTags,
      confidence: document.confidence,
      contentType: document.contentType,
      checksum: document.checksum,
      processing: document.processing,
      vectors: document.vectors,
    },
  };
}

// ─── 10. Delete Document  DELETE /documents/:documentId ──────────────────────

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
