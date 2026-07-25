import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "test", "fixtures", "sample.motn");

const transport = new StdioClientTransport({
  command: "node",
  args: [join(here, "..", "dist", "index.js")],
});
const client = new Client({ name: "smoke", version: "0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

const inspect = await client.callTool({ name: "inspect_project", arguments: { path: fixture } });
const info = JSON.parse(inspect.content[0].text);
console.log("inspect:", info.dimensions, "| objects:", info.counts.objects, "| textCandidates:", info.textCandidates);

const status = await client.callTool({ name: "motion_status", arguments: {} });
console.log("status:", status.content[0].text.replace(/\s+/g, " "));

await client.close();
console.log("SMOKE OK");
