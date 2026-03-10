import { InfrahubError } from "./errors.js";
import { fnv1aHash } from "./hash.js";
import type { HttpClient, HttpRequestOptions, HttpResponse } from "./types.js";

/**
 * Recorder interface — records HTTP responses for later playback.
 * Implementations decide storage format and location.
 */
export interface Recorder {
  record(request: HttpRequestOptions, response: HttpResponse): void | Promise<void>;
}

/** Recorded request/response pair stored by JSONRecorder. */
export interface RecordedEntry {
  status_code: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  request_content: string;
  response_content: string;
}

/** Storage backend for recorder/playback persistence. */
export interface RecorderStorage {
  write(filename: string, data: string): void | Promise<void>;
  read(filename: string): string | Promise<string>;
  exists(filename: string): boolean | Promise<boolean>;
}

/**
 * In-memory storage backend — useful for testing without filesystem.
 */
export class MemoryRecorderStorage implements RecorderStorage {
  private readonly entries = new Map<string, string>();

  write(filename: string, data: string): void {
    this.entries.set(filename, data);
  }

  read(filename: string): string {
    const data = this.entries.get(filename);
    if (data === undefined) {
      throw new InfrahubError(`Recording not found: ${filename}`);
    }
    return data;
  }

  exists(filename: string): boolean {
    return this.entries.has(filename);
  }

  /** Get all stored filenames (for testing introspection). */
  keys(): string[] {
    return [...this.entries.keys()];
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * No-op recorder — does nothing with responses.
 */
export class NoRecorder implements Recorder {
  record(): void {
    // Intentionally empty
  }
}

/**
 * JSON recorder — records HTTP request/response pairs as JSON files.
 * Uses a pluggable storage backend (memory, filesystem, etc.).
 */
export class JSONRecorder implements Recorder {
  private readonly storage: RecorderStorage;

  constructor(storage: RecorderStorage) {
    this.storage = storage;
  }

  async record(request: HttpRequestOptions, response: HttpResponse): Promise<void> {
    const filename = generateRequestFilename(request);
    const entry: RecordedEntry = {
      status_code: response.status,
      method: request.method,
      url: request.url,
      headers: response.headers,
      request_content: request.body !== undefined ? JSON.stringify(request.body) : "",
      response_content: typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data),
    };

    await this.storage.write(filename, JSON.stringify(entry, null, 2));
  }
}

/**
 * JSON playback client — replays recorded HTTP responses instead of making real requests.
 * Wraps an HttpClient interface so it can be injected into InfrahubTransport.
 */
export class JSONPlayback implements HttpClient {
  private readonly storage: RecorderStorage;

  constructor(storage: RecorderStorage) {
    this.storage = storage;
  }

  async request(options: HttpRequestOptions): Promise<HttpResponse> {
    const filename = generateRequestFilename(options);

    const exists = await this.storage.exists(filename);
    if (!exists) {
      throw new InfrahubError(
        `No recording found for ${options.method} ${options.url} (expected: ${filename})`,
      );
    }

    const raw = await this.storage.read(filename);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new InfrahubError(`Invalid JSON in recording file: ${filename}`);
    }
    const entry = parsed as RecordedEntry;

    let data: unknown;
    try {
      data = JSON.parse(entry.response_content);
    } catch {
      data = entry.response_content;
    }

    return {
      status: entry.status_code,
      data,
      headers: entry.headers,
    };
  }
}

/**
 * Recording HTTP client — wraps a real HttpClient and records all responses.
 * Useful for capturing real API interactions for later playback.
 */
export class RecordingHttpClient implements HttpClient {
  private readonly inner: HttpClient;
  private readonly recorder: Recorder;

  constructor(inner: HttpClient, recorder: Recorder) {
    this.inner = inner;
    this.recorder = recorder;
  }

  async request(options: HttpRequestOptions): Promise<HttpResponse> {
    const response = await this.inner.request(options);
    await this.recorder.record(options, response);
    return response;
  }
}

/**
 * Generate a deterministic filename from an HTTP request.
 * Format: {method}-{urlHash}[-{bodyHash}].json
 */
export function generateRequestFilename(request: HttpRequestOptions): string {
  const urlHash = fnv1aHash(request.url);
  const bodyStr = request.body !== undefined ? JSON.stringify(request.body) : "";
  const bodyHash = bodyStr ? `-${fnv1aHash(bodyStr)}` : "";
  return `${request.method.toLowerCase()}-${urlHash}${bodyHash}.json`;
}

