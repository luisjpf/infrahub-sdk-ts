import { describe, it, expect } from "vitest";
import { GraphQLQuery, GraphQLMutation } from "../../../src/graphql/query.js";

describe("GraphQLQuery", () => {
  it("should render a simple query", () => {
    const query = new GraphQLQuery({
      query: { InfrahubInfo: { version: null } },
    });
    const rendered = query.render();
    expect(rendered).toContain("query {");
    expect(rendered).toContain("InfrahubInfo {");
    expect(rendered).toContain("version");
    expect(rendered).toContain("}");
  });

  it("should render a named query", () => {
    const query = new GraphQLQuery({
      name: "GetVersion",
      query: { InfrahubInfo: { version: null } },
    });
    const rendered = query.render();
    expect(rendered).toContain("query GetVersion {");
  });

  it("should render query with variables", () => {
    const query = new GraphQLQuery({
      name: "GetBranch",
      query: {
        Branch: {
          id: null,
          name: null,
          "@filters": { name: "$branch_name" },
        },
      },
      variables: { branch_name: String },
    });
    const rendered = query.render();
    expect(rendered).toContain("query GetBranch ($branch_name: String) {");
    expect(rendered).toContain("Branch(name: $branch_name) {");
    expect(rendered).toContain("id");
    expect(rendered).toContain("name");
  });

  it("should render nested objects", () => {
    const query = new GraphQLQuery({
      query: {
        InfraDevice: {
          edges: {
            node: {
              id: null,
              name: { value: null },
            },
          },
        },
      },
    });
    const rendered = query.render();
    expect(rendered).toContain("InfraDevice {");
    expect(rendered).toContain("edges {");
    expect(rendered).toContain("node {");
    expect(rendered).toContain("id");
    expect(rendered).toContain("name {");
    expect(rendered).toContain("value");
  });

  it("should render inline fragments", () => {
    const query = new GraphQLQuery({
      query: {
        InfraGenericDevice: {
          edges: {
            node: {
              id: null,
              "...on InfraDevice": {
                hostname: { value: null },
              },
            },
          },
        },
      },
    });
    const rendered = query.render();
    expect(rendered).toContain("...on InfraDevice {");
    expect(rendered).toContain("hostname {");
  });

  it("should render filters with multiple parameters", () => {
    const query = new GraphQLQuery({
      query: {
        InfraDevice: {
          count: null,
          edges: { node: { id: null } },
          "@filters": { offset: 0, limit: 10 },
        },
      },
    });
    const rendered = query.render();
    expect(rendered).toContain("InfraDevice(offset: 0, limit: 10) {");
    expect(rendered).toContain("count");
  });
});

describe("GraphQLMutation", () => {
  it("should render a simple mutation", () => {
    const mutation = new GraphQLMutation({
      mutation: "InfraDeviceCreate",
      inputData: {
        data: { name: { value: "router1" } },
      },
      query: { ok: null, object: { id: null } },
    });
    const rendered = mutation.render();
    expect(rendered).toContain("mutation {");
    expect(rendered).toContain("InfraDeviceCreate(");
    expect(rendered).toContain('data: { name: { value: "router1" } }');
    expect(rendered).toContain("ok");
    expect(rendered).toContain("object {");
    expect(rendered).toContain("id");
  });

  it("should render a named mutation", () => {
    const mutation = new GraphQLMutation({
      name: "CreateDevice",
      mutation: "InfraDeviceCreate",
      inputData: { data: {} },
      query: { ok: null },
    });
    const rendered = mutation.render();
    expect(rendered).toContain("mutation CreateDevice {");
  });

  it("should render mutation with variables", () => {
    const mutation = new GraphQLMutation({
      name: "CreateDevice",
      mutation: "InfraDeviceCreate",
      inputData: { data: { name: { value: "$name" } } },
      query: { ok: null },
      variables: { name: String },
    });
    const rendered = mutation.render();
    expect(rendered).toContain("mutation CreateDevice ($name: String) {");
    expect(rendered).toContain("name: { value: $name }");
  });

  it("should render delete mutation", () => {
    const mutation = new GraphQLMutation({
      mutation: "InfraDeviceDelete",
      inputData: { data: { id: "abc-123" } },
      query: { ok: null },
    });
    const rendered = mutation.render();
    expect(rendered).toContain("InfraDeviceDelete(");
    expect(rendered).toContain('data: { id: "abc-123" }');
    expect(rendered).toContain("ok");
  });

  it("should render branch create mutation", () => {
    const mutation = new GraphQLMutation({
      mutation: "BranchCreate",
      inputData: {
        wait_until_completion: true,
        data: {
          name: "feature-1",
          description: "",
          sync_with_git: true,
        },
      },
      query: {
        ok: null,
        object: { id: null, name: null },
      },
    });
    const rendered = mutation.render();
    expect(rendered).toContain("BranchCreate(");
    expect(rendered).toContain("wait_until_completion: true");
    expect(rendered).toContain('"feature-1"');
    expect(rendered).toContain("sync_with_git: true");
  });
});
