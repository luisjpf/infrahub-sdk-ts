import type { AttributeSchema } from "../schema/types.js";

/**
 * Represents a single attribute on an InfrahubNode.
 * Wraps the attribute's value and schema, and tracks mutations
 * for optimized update operations.
 *
 * Mirrors Python SDK's `node/attribute.py`.
 */
export class Attribute {
  readonly name: string;
  readonly schema: AttributeSchema;
  private _value: unknown;
  // previousValue reserved for future diff optimization
  private _isDefault: boolean;
  private _isFromProfile: boolean;
  private _isInherited: boolean;
  private _source: string | null;
  private _owner: string | null;
  private _mutated: boolean = false;

  constructor(name: string, schema: AttributeSchema, data?: unknown) {
    this.name = name;
    this.schema = schema;

    // Data can be a raw value, or a dict like { value: X, is_default: bool, ... }
    if (data !== null && data !== undefined && typeof data === "object" && "value" in (data as Record<string, unknown>)) {
      const d = data as Record<string, unknown>;
      this._value = d.value;
      this._isDefault = (d.is_default as boolean) ?? false;
      this._isFromProfile = (d.is_from_profile as boolean) ?? false;
      this._isInherited = (d.is_inherited as boolean) ?? false;
      this._source = (d.source as Record<string, string>)?.id ?? null;
      this._owner = (d.owner as Record<string, string>)?.id ?? null;
    } else {
      this._value = data;
      this._isDefault = false;
      this._isFromProfile = false;
      this._isInherited = false;
      this._source = null;
      this._owner = null;
    }
    // initialization complete
  }

  /** Get the current attribute value. */
  get value(): unknown {
    return this._value;
  }

  /** Set the attribute value. Marks the attribute as mutated. */
  set value(newValue: unknown) {
    if (newValue !== this._value) {
      this._mutated = true;
    }
    this._value = newValue;
  }

  get isDefault(): boolean {
    return this._isDefault;
  }

  get isFromProfile(): boolean {
    return this._isFromProfile;
  }

  get isInherited(): boolean {
    return this._isInherited;
  }

  get source(): string | null {
    return this._source;
  }

  get owner(): string | null {
    return this._owner;
  }

  /** Whether the value has been changed since initialization. */
  get hasBeenMutated(): boolean {
    return this._mutated;
  }

  /**
   * Generate the input data for a mutation (create/update).
   * Returns the data needed to include this attribute in a GraphQL mutation.
   */
  generateInputData(): Record<string, unknown> | null {
    if (this.schema.read_only) {
      return null;
    }

    const data: Record<string, unknown> = { value: this._value };

    if (this._source) {
      data.source = this._source;
    }
    if (this._owner) {
      data.owner = this._owner;
    }

    return data;
  }

  /**
   * Generate the query data for fetching this attribute in a GraphQL query.
   */
  generateQueryData(includeProperties: boolean = false): Record<string, unknown> {
    const data: Record<string, unknown> = { value: null };

    if (includeProperties) {
      data.is_default = null;
      data.is_from_profile = null;
      data.is_inherited = null;
      data.source = { id: null, display_label: null, __typename: null };
      data.owner = { id: null, display_label: null, __typename: null };
    }

    return data;
  }
}
