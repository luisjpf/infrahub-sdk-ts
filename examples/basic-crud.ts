/**
 * Basic CRUD operations with InfrahubClient.
 *
 * Prerequisites:
 *   - A running Infrahub instance at http://localhost:8000
 *   - An API token (set INFRAHUB_API_TOKEN env var or pass directly)
 *
 * Run:
 *   npx tsx examples/basic-crud.ts
 */

import { InfrahubClient } from "infrahub-sdk";

async function main() {
  // 1. Create a client
  const client = new InfrahubClient({
    address: process.env.INFRAHUB_ADDRESS ?? "http://localhost:8000",
    apiToken: process.env.INFRAHUB_API_TOKEN,
  });

  console.log("Connected to Infrahub");

  // 2. Get server version
  const version = await client.getVersion();
  console.log(`Server version: ${version}`);

  // 3. Create a new device node
  const device = await client.create("InfraDevice", {
    name: "example-router",
    role: "spine",
  });
  console.log("Created local node (not yet saved)");

  // 4. Save to server
  await client.save(device);
  console.log(`Saved device with ID: ${device.id}`);

  // 5. Fetch all devices
  const devices = await client.all("InfraDevice");
  console.log(`Total devices: ${devices.length}`);

  // 6. Get a single device by ID
  const fetched = await client.get("InfraDevice", { id: device.id! });
  console.log(`Fetched device: ${fetched.displayLabel}`);

  // 7. Update the device
  fetched.getAttribute("role").value = "leaf";
  await client.save(fetched);
  console.log("Updated device role to 'leaf'");

  // 8. Count devices
  const count = await client.count("InfraDevice");
  console.log(`Device count: ${count}`);

  // 9. Delete the device
  await client.delete("InfraDevice", device.id!);
  console.log("Deleted device");

  console.log("Done!");
}

main().catch(console.error);
