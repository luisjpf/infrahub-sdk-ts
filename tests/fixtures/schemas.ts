import type { NodeSchema, GenericSchema } from "../../src/schema/types.js";

/**
 * Test schema fixtures — realistic schema definitions for testing.
 */

export const deviceSchema: NodeSchema = {
  id: "schema-device-001",
  kind: "InfraDevice",
  namespace: "Infra",
  name: "Device",
  label: "Device",
  description: "A network device",
  default_filter: "name__value",
  human_friendly_id: ["name__value"],
  display_labels: ["name__value"],
  attributes: [
    {
      name: "name",
      kind: "Text",
      label: "Name",
      unique: true,
      optional: false,
      read_only: false,
      inherited: false,
    },
    {
      name: "description",
      kind: "Text",
      label: "Description",
      unique: false,
      optional: true,
      read_only: false,
      inherited: false,
    },
    {
      name: "role",
      kind: "Dropdown",
      label: "Role",
      unique: false,
      optional: true,
      read_only: false,
      inherited: false,
      choices: [
        { name: "spine", label: "Spine" },
        { name: "leaf", label: "Leaf" },
      ],
    },
    {
      name: "status",
      kind: "Text",
      label: "Status",
      unique: false,
      optional: true,
      read_only: true,
      inherited: false,
    },
  ],
  relationships: [
    {
      name: "site",
      peer: "InfraSite",
      kind: "Attribute",
      direction: "outbound",
      cardinality: "one",
      optional: false,
      read_only: false,
      inherited: false,
    },
    {
      name: "interfaces",
      peer: "InfraInterface",
      kind: "Component",
      direction: "outbound",
      cardinality: "many",
      optional: true,
      read_only: false,
      inherited: false,
    },
    {
      name: "tags",
      peer: "BuiltinTag",
      kind: "Generic",
      direction: "bidirectional",
      cardinality: "many",
      optional: true,
      read_only: true,
      inherited: true,
    },
  ],
  inherit_from: ["InfraGenericDevice"],
};

export const siteSchema: NodeSchema = {
  id: "schema-site-001",
  kind: "InfraSite",
  namespace: "Infra",
  name: "Site",
  label: "Site",
  description: "A physical site",
  attributes: [
    {
      name: "name",
      kind: "Text",
      label: "Name",
      unique: true,
      optional: false,
      read_only: false,
      inherited: false,
    },
    {
      name: "location",
      kind: "Text",
      label: "Location",
      unique: false,
      optional: true,
      read_only: false,
      inherited: false,
    },
  ],
  relationships: [],
  inherit_from: [],
};

export const genericDeviceSchema: GenericSchema = {
  id: "schema-generic-device-001",
  kind: "InfraGenericDevice",
  namespace: "Infra",
  name: "GenericDevice",
  label: "Generic Device",
  attributes: [
    {
      name: "name",
      kind: "Text",
      label: "Name",
      unique: true,
      optional: false,
      read_only: false,
      inherited: false,
    },
  ],
  relationships: [],
  used_by: ["InfraDevice"],
};

/** Helper to create a simple schema for testing. */
export function createSimpleSchema(
  kind: string,
  attributes: string[] = ["name"],
): NodeSchema {
  return {
    kind,
    namespace: "Test",
    name: kind.replace("Test", ""),
    attributes: attributes.map((name) => ({
      name,
      kind: "Text" as const,
      unique: false,
      optional: false,
      read_only: false,
      inherited: false,
    })),
    relationships: [],
    inherit_from: [],
  };
}
