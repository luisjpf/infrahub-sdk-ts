import { z } from "zod";

/**
 * Zod schema for InfrahubConfig — validates configuration at runtime.
 */
export const InfrahubConfigSchema = z
  .object({
    address: z
      .string()
      .url("The configured address is not a valid URL")
      .default("http://localhost:8000")
      .transform((v) => v.replace(/\/+$/, "")),
    apiToken: z.string().optional(),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    defaultBranch: z.string().default("main"),
    timeout: z.number().int().positive().default(60),
    paginationSize: z.number().int().positive().default(50),
    maxConcurrentExecution: z.number().int().positive().default(5),
    retryOnFailure: z.boolean().default(false),
    retryDelay: z.number().int().positive().default(5),
    maxRetryDuration: z.number().int().positive().default(300),
    retryBackoff: z.enum(["constant", "exponential"]).default("constant"),
    retryMaxDelay: z.number().int().positive().default(60),
    retryJitter: z.boolean().default(true),
  })
  .refine(
    (data) => {
      const hasUsername = data.username !== undefined;
      const hasPassword = data.password !== undefined;
      return hasUsername === hasPassword;
    },
    { message: "Both 'username' and 'password' must be set together" },
  )
  .refine(
    (data) => {
      return !(data.password && data.apiToken);
    },
    { message: "Cannot combine password with token-based authentication" },
  );

/** Inferred TypeScript type from the Zod schema. */
export type InfrahubConfig = z.infer<typeof InfrahubConfigSchema>;

/** Input type (before defaults are applied). */
export type InfrahubConfigInput = z.input<typeof InfrahubConfigSchema>;

/**
 * Create and validate an InfrahubConfig from partial input.
 * Applies defaults and validates constraints.
 */
export function createConfig(input: InfrahubConfigInput = {}): InfrahubConfig {
  return InfrahubConfigSchema.parse(input);
}
