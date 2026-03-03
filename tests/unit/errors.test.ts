import { describe, it, expect } from "vitest";
import {
  ServerNotResponsiveError,
  URLNotFoundError,
  GraphQLError,
} from "../../src/errors.js";

describe("ServerNotResponsiveError", () => {
  it("should set url and timeout properties", () => {
    const err = new ServerNotResponsiveError("http://localhost:8000/api", 30);
    expect(err.url).toBe("http://localhost:8000/api");
    expect(err.timeout).toBe(30);
    expect(err.name).toBe("ServerNotResponsiveError");
    expect(err.message).toContain("http://localhost:8000/api");
    expect(err.message).toContain("30 sec");
  });

  it("should generate default message with timeout", () => {
    const err = new ServerNotResponsiveError("http://example.com/graphql", 10);
    expect(err.message).toBe(
      "Unable to read from 'http://example.com/graphql'. (timeout: 10 sec)",
    );
  });

  it("should generate default message without timeout", () => {
    const err = new ServerNotResponsiveError("http://example.com/graphql");
    expect(err.message).toBe(
      "Unable to read from 'http://example.com/graphql'.",
    );
    expect(err.timeout).toBeUndefined();
  });

  it("should use custom message when provided", () => {
    const err = new ServerNotResponsiveError("http://example.com", 5, "Custom message");
    expect(err.message).toBe("Custom message");
    expect(err.url).toBe("http://example.com");
    expect(err.timeout).toBe(5);
  });

  it("should be an instance of Error", () => {
    const err = new ServerNotResponsiveError("http://localhost", 10);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("URLNotFoundError", () => {
  it("should set url property and format message", () => {
    const err = new URLNotFoundError("http://localhost:8000/api/missing");
    expect(err.url).toBe("http://localhost:8000/api/missing");
    expect(err.name).toBe("URLNotFoundError");
    expect(err.message).toBe("`http://localhost:8000/api/missing` not found.");
  });

  it("should be an instance of Error", () => {
    const err = new URLNotFoundError("/some/path");
    expect(err).toBeInstanceOf(Error);
  });

  it("should include backtick-wrapped URL in message", () => {
    const err = new URLNotFoundError("https://infrahub.example.com/api/v1/endpoint");
    expect(err.message).toContain("`https://infrahub.example.com/api/v1/endpoint`");
  });
});

describe("GraphQLError", () => {
  it("should format error messages from errors array", () => {
    const errors = [
      { message: "Field not found" },
      { message: "Invalid query" },
    ];
    const err = new GraphQLError(errors, "{ test }");
    expect(err.message).toContain("Field not found");
    expect(err.message).toContain("Invalid query");
    expect(err.errors).toBe(errors);
    expect(err.query).toBe("{ test }");
    expect(err.name).toBe("GraphQLError");
  });

  it("should truncate long queries in the message to 200 characters", () => {
    const longQuery = "query { " + "a".repeat(300) + " }";
    expect(longQuery.length).toBeGreaterThan(200);

    const err = new GraphQLError([{ message: "error" }], longQuery);
    // The query preview should be truncated to 200 chars + "..."
    expect(err.message).toContain("...");
    // The full query should be stored in the property
    expect(err.query).toBe(longQuery);
    // Message should not contain the full query
    expect(err.message.length).toBeLessThan(longQuery.length + 100);
  });

  it("should not truncate short queries", () => {
    const shortQuery = "{ test }";
    const err = new GraphQLError([{ message: "error" }], shortQuery);
    expect(err.message).toContain("{ test }");
    expect(err.message).not.toContain("...");
  });

  it("should handle errors without message property", () => {
    const errors = [{ code: "UNKNOWN" }];
    const err = new GraphQLError(errors);
    // Should fall back to JSON.stringify for errors without message
    expect(err.message).toContain('{"code":"UNKNOWN"}');
  });

  it("should show 'unknown' when no query provided", () => {
    const err = new GraphQLError([{ message: "error" }]);
    expect(err.message).toContain("(query: unknown)");
    expect(err.query).toBeUndefined();
  });

  it("should store variables", () => {
    const vars = { id: "123", name: "test" };
    const err = new GraphQLError([{ message: "error" }], "query($id: ID!) { node(id: $id) { name } }", vars);
    expect(err.variables).toBe(vars);
  });

  it("should handle exactly 200-character query without truncation", () => {
    const exactQuery = "x".repeat(200);
    const err = new GraphQLError([{ message: "error" }], exactQuery);
    expect(err.message).toContain(exactQuery);
    expect(err.message).not.toContain("...");
  });
});
