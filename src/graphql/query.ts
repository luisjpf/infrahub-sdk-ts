import {
  renderInputBlock,
  renderQueryBlock,
  renderVariablesToString,
} from "./renderer.js";

type QueryDict = Record<string, unknown>;

/**
 * Builds a GraphQL query string from a dict-based query structure.
 * Mirrors the Python SDK's `Query` class.
 */
export class GraphQLQuery {
  readonly queryType = "query";
  readonly indentation: number = 4;
  readonly query: QueryDict;
  readonly variables?: Record<string, unknown>;
  readonly name: string;

  constructor(options: {
    query: QueryDict;
    variables?: Record<string, unknown>;
    name?: string;
  }) {
    this.query = options.query;
    this.variables = options.variables;
    this.name = options.name ?? "";
  }

  private renderFirstLine(): string {
    let firstLine = this.queryType;

    if (this.name) {
      firstLine += " " + this.name;
    }

    if (this.variables && Object.keys(this.variables).length > 0) {
      firstLine += ` (${renderVariablesToString(this.variables)})`;
    }

    firstLine += " {";
    return firstLine;
  }

  render(convertEnum: boolean = false): string {
    const lines = [this.renderFirstLine()];
    lines.push(
      ...renderQueryBlock(
        this.query,
        this.indentation,
        this.indentation,
        convertEnum,
      ),
    );
    lines.push("}");
    return "\n" + lines.join("\n") + "\n";
  }
}

/**
 * Builds a GraphQL mutation string from a dict-based structure.
 * Mirrors the Python SDK's `Mutation` class.
 */
export class GraphQLMutation {
  readonly queryType = "mutation";
  readonly indentation: number = 4;
  readonly query: QueryDict;
  readonly variables?: Record<string, unknown>;
  readonly name: string;
  readonly mutation: string;
  readonly inputData: Record<string, unknown>;

  constructor(options: {
    mutation: string;
    inputData: Record<string, unknown>;
    query: QueryDict;
    variables?: Record<string, unknown>;
    name?: string;
  }) {
    this.mutation = options.mutation;
    this.inputData = options.inputData;
    this.query = options.query;
    this.variables = options.variables;
    this.name = options.name ?? "";
  }

  private renderFirstLine(): string {
    let firstLine = this.queryType;

    if (this.name) {
      firstLine += " " + this.name;
    }

    if (this.variables && Object.keys(this.variables).length > 0) {
      firstLine += ` (${renderVariablesToString(this.variables)})`;
    }

    firstLine += " {";
    return firstLine;
  }

  render(convertEnum: boolean = false): string {
    const indent = " ".repeat(this.indentation);
    const lines = [this.renderFirstLine()];

    lines.push(`${indent}${this.mutation}(`);
    lines.push(
      ...renderInputBlock(
        this.inputData,
        this.indentation,
        this.indentation * 2,
        convertEnum,
      ),
    );
    lines.push(`${indent}){`);
    lines.push(
      ...renderQueryBlock(
        this.query,
        this.indentation,
        this.indentation * 2,
        convertEnum,
      ),
    );
    lines.push(`${indent}}`, "}");

    return "\n" + lines.join("\n") + "\n";
  }
}
