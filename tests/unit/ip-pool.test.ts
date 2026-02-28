import { describe, it, expect } from "vitest";
import { ValidationError } from "../../src/errors.js";
import {
  buildIPAddressAllocationMutation,
  buildIPPrefixAllocationMutation,
  parseAllocationResponse,
} from "../../src/ip-pool.js";

describe("buildIPAddressAllocationMutation", () => {
  it("should build minimal mutation with just pool ID", () => {
    const mutation = buildIPAddressAllocationMutation({
      resourcePoolId: "pool-uuid-123",
    });

    const rendered = mutation.render();
    expect(rendered).toContain("InfrahubIPAddressPoolGetResource");
    expect(rendered).toContain("pool-uuid-123");
    expect(rendered).toContain("ok");
    expect(rendered).toContain("node");
    expect(rendered).toContain("id");
    expect(rendered).toContain("kind");
    expect(rendered).toContain("identifier");
    expect(rendered).toContain("display_label");
  });

  it("should include optional identifier", () => {
    const mutation = buildIPAddressAllocationMutation({
      resourcePoolId: "pool-123",
      identifier: "my-allocation",
    });

    const rendered = mutation.render();
    expect(rendered).toContain("my-allocation");
  });

  it("should include prefix_length", () => {
    const mutation = buildIPAddressAllocationMutation({
      resourcePoolId: "pool-123",
      prefixLength: 24,
    });

    const rendered = mutation.render();
    expect(rendered).toContain("prefix_length");
    expect(rendered).toContain("24");
  });

  it("should include address_type as prefix_type", () => {
    const mutation = buildIPAddressAllocationMutation({
      resourcePoolId: "pool-123",
      addressType: "IpamIPAddress",
    });

    const rendered = mutation.render();
    expect(rendered).toContain("prefix_type");
    expect(rendered).toContain("IpamIPAddress");
  });

  it("should include all options together", () => {
    const mutation = buildIPAddressAllocationMutation({
      resourcePoolId: "pool-123",
      identifier: "test-id",
      prefixLength: 32,
      addressType: "IpamIPAddress",
      data: { description: { value: "auto-assigned" } },
    });

    const rendered = mutation.render();
    expect(rendered).toContain("pool-123");
    expect(rendered).toContain("test-id");
    expect(rendered).toContain("prefix_length");
    expect(rendered).toContain("prefix_type");
    expect(rendered).toContain("description");
  });
});

describe("buildIPPrefixAllocationMutation", () => {
  it("should build minimal mutation with just pool ID", () => {
    const mutation = buildIPPrefixAllocationMutation({
      resourcePoolId: "prefix-pool-456",
    });

    const rendered = mutation.render();
    expect(rendered).toContain("InfrahubIPPrefixPoolGetResource");
    expect(rendered).toContain("prefix-pool-456");
  });

  it("should include member_type", () => {
    const mutation = buildIPPrefixAllocationMutation({
      resourcePoolId: "pool-123",
      memberType: "prefix",
    });

    const rendered = mutation.render();
    expect(rendered).toContain("member_type");
    expect(rendered).toContain("prefix");
  });

  it("should include prefix_type", () => {
    const mutation = buildIPPrefixAllocationMutation({
      resourcePoolId: "pool-123",
      prefixType: "IpamIPPrefix",
    });

    const rendered = mutation.render();
    expect(rendered).toContain("prefix_type");
    expect(rendered).toContain("IpamIPPrefix");
  });

  it("should include prefix_length", () => {
    const mutation = buildIPPrefixAllocationMutation({
      resourcePoolId: "pool-123",
      prefixLength: 24,
    });

    const rendered = mutation.render();
    expect(rendered).toContain("prefix_length");
    expect(rendered).toContain("24");
  });

  it("should include all options together", () => {
    const mutation = buildIPPrefixAllocationMutation({
      resourcePoolId: "pool-123",
      identifier: "my-prefix",
      prefixLength: 24,
      memberType: "address",
      prefixType: "IpamIPPrefix",
      data: { vlan: { value: 100 } },
    });

    const rendered = mutation.render();
    expect(rendered).toContain("pool-123");
    expect(rendered).toContain("my-prefix");
    expect(rendered).toContain("member_type");
    expect(rendered).toContain("prefix_type");
    expect(rendered).toContain("prefix_length");
  });
});

describe("parseAllocationResponse", () => {
  it("should parse successful allocation", () => {
    const response = {
      InfrahubIPAddressPoolGetResource: {
        ok: true,
        node: {
          id: "addr-uuid-789",
          kind: "IpamIPAddress",
          identifier: "my-allocation",
          display_label: "10.0.0.1/32",
        },
      },
    };

    const result = parseAllocationResponse(response, "InfrahubIPAddressPoolGetResource");

    expect(result.ok).toBe(true);
    expect(result.node).not.toBeNull();
    expect(result.node!.id).toBe("addr-uuid-789");
    expect(result.node!.kind).toBe("IpamIPAddress");
    expect(result.node!.identifier).toBe("my-allocation");
    expect(result.node!.display_label).toBe("10.0.0.1/32");
  });

  it("should handle failed allocation (ok=false)", () => {
    const response = {
      InfrahubIPAddressPoolGetResource: {
        ok: false,
        node: null,
      },
    };

    const result = parseAllocationResponse(response, "InfrahubIPAddressPoolGetResource");

    expect(result.ok).toBe(false);
    expect(result.node).toBeNull();
  });

  it("should handle missing mutation key in response", () => {
    const response = {};

    const result = parseAllocationResponse(response, "InfrahubIPAddressPoolGetResource");

    expect(result.ok).toBe(false);
    expect(result.node).toBeNull();
  });

  it("should handle null identifier in node", () => {
    const response = {
      InfrahubIPPrefixPoolGetResource: {
        ok: true,
        node: {
          id: "prefix-uuid-123",
          kind: "IpamIPPrefix",
          identifier: null,
          display_label: "10.0.0.0/24",
        },
      },
    };

    const result = parseAllocationResponse(response, "InfrahubIPPrefixPoolGetResource");

    expect(result.ok).toBe(true);
    expect(result.node!.identifier).toBeNull();
  });
});
