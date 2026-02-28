import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  NoRecorder,
  JSONRecorder,
  JSONPlayback,
  RecordingHttpClient,
  MemoryRecorderStorage,
  generateRequestFilename,
} from "../../src/recorder.js";
import type { HttpClient, HttpRequestOptions, HttpResponse } from "../../src/types.js";

describe("generateRequestFilename", () => {
  it("should generate deterministic filenames", () => {
    const request: HttpRequestOptions = {
      method: "POST",
      url: "http://localhost:8000/graphql/main",
      body: { query: "{ TestNode { edges { node { id } } } }" },
    };

    const name1 = generateRequestFilename(request);
    const name2 = generateRequestFilename(request);

    expect(name1).toBe(name2);
    expect(name1).toMatch(/^post-[0-9a-f]{8}-[0-9a-f]{8}\.json$/);
  });

  it("should produce different names for different URLs", () => {
    const r1: HttpRequestOptions = { method: "GET", url: "http://localhost/a" };
    const r2: HttpRequestOptions = { method: "GET", url: "http://localhost/b" };

    expect(generateRequestFilename(r1)).not.toBe(generateRequestFilename(r2));
  });

  it("should produce different names for different methods", () => {
    const r1: HttpRequestOptions = { method: "GET", url: "http://localhost/a" };
    const r2: HttpRequestOptions = { method: "POST", url: "http://localhost/a" };

    expect(generateRequestFilename(r1)).not.toBe(generateRequestFilename(r2));
  });

  it("should produce different names for different bodies", () => {
    const r1: HttpRequestOptions = { method: "POST", url: "http://localhost/a", body: { a: 1 } };
    const r2: HttpRequestOptions = { method: "POST", url: "http://localhost/a", body: { b: 2 } };

    expect(generateRequestFilename(r1)).not.toBe(generateRequestFilename(r2));
  });

  it("should handle requests without body", () => {
    const request: HttpRequestOptions = { method: "GET", url: "http://localhost/a" };
    const name = generateRequestFilename(request);

    expect(name).toMatch(/^get-[0-9a-f]{8}\.json$/);
  });
});

describe("MemoryRecorderStorage", () => {
  let storage: MemoryRecorderStorage;

  beforeEach(() => {
    storage = new MemoryRecorderStorage();
  });

  it("should write and read entries", () => {
    storage.write("test.json", '{"data": true}');
    expect(storage.read("test.json")).toBe('{"data": true}');
  });

  it("should check existence", () => {
    expect(storage.exists("test.json")).toBe(false);
    storage.write("test.json", "data");
    expect(storage.exists("test.json")).toBe(true);
  });

  it("should throw on reading non-existent entry", () => {
    expect(() => storage.read("missing.json")).toThrow("Recording not found: missing.json");
  });

  it("should list keys", () => {
    storage.write("a.json", "a");
    storage.write("b.json", "b");
    expect(storage.keys()).toEqual(["a.json", "b.json"]);
  });

  it("should clear all entries", () => {
    storage.write("a.json", "a");
    storage.clear();
    expect(storage.keys()).toEqual([]);
  });
});

describe("NoRecorder", () => {
  it("should do nothing on record", () => {
    const recorder = new NoRecorder();
    // Should not throw
    recorder.record();
  });
});

describe("JSONRecorder", () => {
  let storage: MemoryRecorderStorage;
  let recorder: JSONRecorder;

  beforeEach(() => {
    storage = new MemoryRecorderStorage();
    recorder = new JSONRecorder(storage);
  });

  it("should record a request/response pair", async () => {
    const request: HttpRequestOptions = {
      method: "POST",
      url: "http://localhost:8000/graphql/main",
      body: { query: "{ Test { edges { node { id } } } }" },
    };
    const response: HttpResponse = {
      status: 200,
      data: { data: { Test: { edges: [] } } },
      headers: { "content-type": "application/json" },
    };

    await recorder.record(request, response);

    expect(storage.keys()).toHaveLength(1);
    const filename = storage.keys()[0]!;
    const recorded = JSON.parse(storage.read(filename));

    expect(recorded.status_code).toBe(200);
    expect(recorded.method).toBe("POST");
    expect(recorded.url).toBe("http://localhost:8000/graphql/main");
    expect(recorded.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(recorded.request_content)).toEqual({
      query: "{ Test { edges { node { id } } } }",
    });
    expect(JSON.parse(recorded.response_content)).toEqual({
      data: { Test: { edges: [] } },
    });
  });

  it("should handle string response data", async () => {
    const request: HttpRequestOptions = {
      method: "GET",
      url: "http://localhost:8000/api/storage/object/abc",
    };
    const response: HttpResponse = {
      status: 200,
      data: "plain text content",
      headers: {},
    };

    await recorder.record(request, response);

    const filename = storage.keys()[0]!;
    const recorded = JSON.parse(storage.read(filename));
    expect(recorded.response_content).toBe("plain text content");
  });

  it("should handle requests without body", async () => {
    const request: HttpRequestOptions = {
      method: "GET",
      url: "http://localhost:8000/api/schema/",
    };
    const response: HttpResponse = {
      status: 200,
      data: { nodes: [] },
      headers: {},
    };

    await recorder.record(request, response);

    const filename = storage.keys()[0]!;
    const recorded = JSON.parse(storage.read(filename));
    expect(recorded.request_content).toBe("");
  });
});

describe("JSONPlayback", () => {
  let storage: MemoryRecorderStorage;
  let playback: JSONPlayback;

  beforeEach(() => {
    storage = new MemoryRecorderStorage();
    playback = new JSONPlayback(storage);
  });

  it("should replay a recorded response", async () => {
    const request: HttpRequestOptions = {
      method: "POST",
      url: "http://localhost:8000/graphql/main",
      body: { query: "{ Test { edges { node { id } } } }" },
    };

    // Store a recorded entry
    const filename = generateRequestFilename(request);
    storage.write(filename, JSON.stringify({
      status_code: 200,
      method: "POST",
      url: request.url,
      headers: { "content-type": "application/json" },
      request_content: JSON.stringify(request.body),
      response_content: JSON.stringify({ data: { Test: { edges: [] } } }),
    }));

    const response = await playback.request(request);

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ data: { Test: { edges: [] } } });
    expect(response.headers).toEqual({ "content-type": "application/json" });
  });

  it("should handle non-JSON response content", async () => {
    const request: HttpRequestOptions = {
      method: "GET",
      url: "http://localhost:8000/api/storage/object/abc",
    };

    const filename = generateRequestFilename(request);
    storage.write(filename, JSON.stringify({
      status_code: 200,
      method: "GET",
      url: request.url,
      headers: {},
      request_content: "",
      response_content: "plain text that is not valid JSON",
    }));

    const response = await playback.request(request);

    expect(response.status).toBe(200);
    expect(response.data).toBe("plain text that is not valid JSON");
  });

  it("should throw when no recording exists", async () => {
    const request: HttpRequestOptions = {
      method: "GET",
      url: "http://localhost:8000/unknown",
    };

    await expect(playback.request(request)).rejects.toThrow(
      /No recording found for GET/,
    );
  });
});

describe("RecordingHttpClient", () => {
  it("should delegate to inner client and record the response", async () => {
    const mockResponse: HttpResponse = {
      status: 200,
      data: { result: "ok" },
      headers: { "x-custom": "value" },
    };

    const innerClient: HttpClient = {
      request: vi.fn().mockResolvedValue(mockResponse),
    };

    const storage = new MemoryRecorderStorage();
    const recorder = new JSONRecorder(storage);
    const client = new RecordingHttpClient(innerClient, recorder);

    const request: HttpRequestOptions = {
      method: "POST",
      url: "http://localhost:8000/graphql",
      body: { query: "{ version }" },
    };

    const response = await client.request(request);

    // Should return the real response
    expect(response).toBe(mockResponse);

    // Should have recorded
    expect(storage.keys()).toHaveLength(1);
    const recorded = JSON.parse(storage.read(storage.keys()[0]!));
    expect(recorded.status_code).toBe(200);
    expect(recorded.method).toBe("POST");
  });

  it("should not record if inner client throws", async () => {
    const innerClient: HttpClient = {
      request: vi.fn().mockRejectedValue(new Error("network failure")),
    };

    const storage = new MemoryRecorderStorage();
    const recorder = new JSONRecorder(storage);
    const client = new RecordingHttpClient(innerClient, recorder);

    const request: HttpRequestOptions = {
      method: "GET",
      url: "http://localhost:8000/api",
    };

    await expect(client.request(request)).rejects.toThrow("network failure");
    expect(storage.keys()).toHaveLength(0);
  });
});

describe("Round-trip: Record then Playback", () => {
  it("should perfectly reproduce responses through record/playback cycle", async () => {
    const storage = new MemoryRecorderStorage();
    const recorder = new JSONRecorder(storage);

    // Record a response
    const request: HttpRequestOptions = {
      method: "POST",
      url: "http://localhost:8000/graphql/main",
      body: { query: "{ InfraDevice { edges { node { id name { value } } } } }" },
    };
    const originalResponse: HttpResponse = {
      status: 200,
      data: {
        data: {
          InfraDevice: {
            edges: [
              { node: { id: "abc-123", name: { value: "router-01" } } },
            ],
          },
        },
      },
      headers: { "content-type": "application/json" },
    };

    await recorder.record(request, originalResponse);

    // Playback the same request
    const playback = new JSONPlayback(storage);
    const replayedResponse = await playback.request(request);

    expect(replayedResponse.status).toBe(originalResponse.status);
    expect(replayedResponse.data).toEqual(originalResponse.data);
    expect(replayedResponse.headers).toEqual(originalResponse.headers);
  });
});
