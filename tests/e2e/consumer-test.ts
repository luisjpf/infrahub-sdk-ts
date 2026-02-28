/**
 * E2E consumer test — runs against a live Infrahub instance.
 *
 * Exercises: client init, schema verification, CRUD, relationships,
 * typed client, and deletion.
 *
 * Exit code 0 = all passed, 1 = at least one failure.
 */

import { InfrahubClient } from "infrahub-sdk";
import { createTypedClient } from "./generated/index.js";

const ADDRESS = process.env.INFRAHUB_ADDRESS;
const TOKEN = process.env.INFRAHUB_API_TOKEN;

if (!ADDRESS || !TOKEN) {
  console.error("INFRAHUB_ADDRESS and INFRAHUB_API_TOKEN must be set");
  process.exit(1);
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

async function run(): Promise<void> {
  // ── 1. Client init ──
  console.log("\n1. Client init");
  const client = new InfrahubClient({ address: ADDRESS!, apiToken: TOKEN! });
  assert(client !== null, "client created");

  // ── 2. Schema verification ──
  console.log("\n2. Schema verification");
  const deviceSchema = await client.schema.get("TestingDevice");
  assert(deviceSchema.kind === "TestingDevice", "TestingDevice schema loaded");
  const ifaceSchema = await client.schema.get("TestingInterface");
  assert(ifaceSchema.kind === "TestingInterface", "TestingInterface schema loaded");

  // ── 3. Create ──
  console.log("\n3. Create");
  const device = await client.create("TestingDevice", {
    name: { value: "e2e-router-01" },
    description: { value: "E2E test device" },
    role: { value: "router" },
  });
  await client.save(device);
  assert(typeof device.id === "string" && device.id.length > 0, "device created with ID");
  const deviceId = device.id!;

  const iface1 = await client.create("TestingInterface", {
    name: { value: "eth0" },
    speed: { value: 1000 },
    enabled: { value: true },
    device: { id: deviceId },
  });
  await client.save(iface1);
  assert(typeof iface1.id === "string" && iface1.id.length > 0, "interface eth0 created");
  const iface1Id = iface1.id!;

  const iface2 = await client.create("TestingInterface", {
    name: { value: "eth1" },
    speed: { value: 10000 },
    enabled: { value: false },
    device: { id: deviceId },
  });
  await client.save(iface2);
  assert(typeof iface2.id === "string" && iface2.id.length > 0, "interface eth1 created");
  const iface2Id = iface2.id!;

  // ── 4. Get ──
  console.log("\n4. Get");
  const fetched = await client.get("TestingDevice", { id: deviceId });
  assert(fetched.getAttribute("name").value === "e2e-router-01", "fetched device name matches");
  assert(fetched.getAttribute("description").value === "E2E test device", "fetched device description matches");
  assert(fetched.getAttribute("role").value === "router", "fetched device role matches");

  // ── 5. All ──
  console.log("\n5. All");
  const allDevices = await client.all("TestingDevice");
  assert(allDevices.length >= 1, `all() returned ${allDevices.length} device(s)`);

  // ── 6. Count ──
  console.log("\n6. Count");
  const deviceCount = await client.count("TestingDevice");
  assert(deviceCount >= 1, `count() returned ${deviceCount}`);

  // ── 7. Update ──
  console.log("\n7. Update");
  fetched.getAttribute("description").value = "Updated E2E device";
  await client.save(fetched);
  const refetched = await client.get("TestingDevice", { id: deviceId });
  assert(refetched.getAttribute("description").value === "Updated E2E device", "description updated");

  // ── 8. Relationships ──
  console.log("\n8. Relationships");
  const fetchedIface = await client.get("TestingInterface", { id: iface1Id });
  const relatedDevice = fetchedIface.getRelatedNode("device");
  assert(relatedDevice !== undefined, "interface has device relationship");
  assert(relatedDevice?.id === deviceId, "related device ID matches");

  // ── 9. TypedClient ──
  console.log("\n9. TypedClient");
  const typed = createTypedClient(client);
  assert(typed.client === client, "typed client wraps original");
  const typedDevices = await typed.device.all();
  assert(typedDevices.length >= 1, `typed.device.all() returned ${typedDevices.length}`);
  const typedCount = await typed.device.count();
  assert(typedCount >= 1, `typed.device.count() returned ${typedCount}`);

  // ── 10. Delete ──
  console.log("\n10. Delete");
  await client.delete("TestingInterface", iface1Id);
  await client.delete("TestingInterface", iface2Id);
  await client.delete("TestingDevice", deviceId);

  let deletionVerified = false;
  try {
    await client.get("TestingDevice", { id: deviceId });
  } catch {
    deletionVerified = true;
  }
  assert(deletionVerified, "device deleted and verified gone");

  // ── Summary ──
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
