import { describe, it, expect, vi } from "vitest";
import { InfrahubBatch } from "../../src/batch.js";

describe("InfrahubBatch", () => {
  it("should start with zero tasks", () => {
    const batch = new InfrahubBatch();
    expect(batch.size).toBe(0);
  });

  it("should track added tasks", () => {
    const batch = new InfrahubBatch();
    batch.add(async () => "result1");
    batch.add(async () => "result2");
    expect(batch.size).toBe(2);
  });

  it("should execute all tasks and return results in order", async () => {
    const batch = new InfrahubBatch();
    batch.add(async () => "a", [], "task-a");
    batch.add(async () => "b", [], "task-b");
    batch.add(async () => "c", [], "task-c");

    const results = await batch.execute();
    expect(results).toHaveLength(3);
    expect(results[0]!.result).toBe("a");
    expect(results[0]!.label).toBe("task-a");
    expect(results[1]!.result).toBe("b");
    expect(results[2]!.result).toBe("c");
  });

  it("should pass arguments to tasks", async () => {
    const batch = new InfrahubBatch();
    batch.add(async (x: unknown, y: unknown) => `${x}-${y}`, [1, 2]);

    const results = await batch.execute();
    expect(results[0]!.result).toBe("1-2");
  });

  it("should respect concurrency limit", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const batch = new InfrahubBatch({ maxConcurrentExecution: 2 });

    const createTask = () => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent--;
      return "done";
    };

    batch.add(createTask());
    batch.add(createTask());
    batch.add(createTask());
    batch.add(createTask());

    await batch.execute();

    // Max concurrent should not exceed 2
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("should propagate errors by default", async () => {
    const batch = new InfrahubBatch();
    batch.add(async () => {
      throw new Error("task failed");
    });

    await expect(batch.execute()).rejects.toThrow("task failed");
  });

  it("should capture errors when returnExceptions is true", async () => {
    const batch = new InfrahubBatch({ returnExceptions: true });
    batch.add(async () => "success", [], "ok-task");
    batch.add(
      async () => {
        throw new Error("failure");
      },
      [],
      "bad-task",
    );

    const results = await batch.execute();
    expect(results).toHaveLength(2);
    expect(results[0]!.result).toBe("success");
    expect(results[1]!.error).toBeDefined();
    expect(results[1]!.error!.message).toBe("failure");
    expect(results[1]!.label).toBe("bad-task");
  });

  it("should handle empty batch", async () => {
    const batch = new InfrahubBatch();
    const results = await batch.execute();
    expect(results).toEqual([]);
  });

  it("should handle tasks with no arguments", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    const batch = new InfrahubBatch();
    batch.add(fn);

    const results = await batch.execute();
    expect(results[0]!.result).toBe("result");
    expect(fn).toHaveBeenCalledOnce();
  });
});
