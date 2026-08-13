import path from "node:path";

export function resolveNodePackageManagerCommand(tool, options = {}) {
  if (!new Set(["npm", "npx"]).has(tool)) {
    throw new Error(`Unsupported Node package manager command '${tool}'`);
  }
  const platform = options.platform || process.platform;
  const execPath = options.execPath || process.execPath;
  if (platform !== "win32") return { command: tool, args: [] };

  const cli = path.win32.join(
    path.win32.dirname(execPath),
    "node_modules",
    "npm",
    "bin",
    `${tool}-cli.js`
  );
  return { command: execPath, args: [cli] };
}
