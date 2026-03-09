/**
 * Batch execution support for running multiple async tasks with concurrency control.
 * Mirrors the Python SDK's `InfrahubBatch` class.
 */

/** A single task in a batch. */
interface BatchTask<T> {
  task: (...args: unknown[]) => Promise<T>;
  args: unknown[];
  label?: string;
}

/**
 * Executes multiple async tasks concurrently with a configurable concurrency limit.
 */
export class InfrahubBatch {
  private readonly _maxConcurrent: number;
  private readonly _returnExceptions: boolean;
  private readonly _tasks: BatchTask<unknown>[] = [];

  constructor(options: {
    maxConcurrentExecution?: number;
    returnExceptions?: boolean;
  } = {}) {
    this._maxConcurrent = options.maxConcurrentExecution ?? 5;
    this._returnExceptions = options.returnExceptions ?? false;
  }

  /** Add a task to the batch. */
  add<T>(
    task: (...args: unknown[]) => Promise<T>,
    args: unknown[] = [],
    label?: string,
  ): void {
    this._tasks.push({ task, args, label });
  }

  /** Number of queued tasks. */
  get size(): number {
    return this._tasks.length;
  }

  /**
   * Execute all tasks with concurrency control.
   * Returns results in the order tasks were added.
   */
  async execute(): Promise<Array<{ result?: unknown; error?: Error; label?: string }>> {
    const results: Array<{ result?: unknown; error?: Error; label?: string }> = [];
    const executing = new Set<Promise<void>>();

    for (let i = 0; i < this._tasks.length; i++) {
      const task = this._tasks[i]!;
      const index = i;

      const p = (async () => {
        try {
          const result = await task.task(...task.args);
          results[index] = { result, label: task.label };
        } catch (error) {
          if (this._returnExceptions) {
            results[index] = { error: error instanceof Error ? error : new Error(String(error)), label: task.label };
          } else {
            throw error;
          }
        }
      })();

      const tracked = p.then(() => {
        executing.delete(tracked);
      });
      executing.add(tracked);

      if (executing.size >= this._maxConcurrent) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
    return results;
  }
}
