import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["extension", "scripts", "src", "test"];
const files = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(filename);
    else if (entry.name.endsWith(".js")) files.push(filename);
  }
}

for (const root of roots) collect(path.resolve(root));
for (const filename of files) {
  const result = spawnSync(process.execPath, ["--check", filename], { stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
