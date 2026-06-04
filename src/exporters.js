import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "..");
const exporterScript = join(projectRoot, "scripts", "export_xlsx.py");
const bundledPython = "C:\\Users\\Verslan CEO\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

export function toCsv(rows) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header] ?? "";
          const text = String(value).replaceAll("\"", "\"\"");
          return /[",\n]/.test(text) ? `"${text}"` : text;
        })
        .join(",")
    )
  ];

  return lines.join("\n");
}

async function runPythonExporter(inputPath, outputPath, title) {
  const candidates = [
    { command: process.env.PPF_PYTHON_PATH || bundledPython, args: [] },
    { command: "python", args: [] },
    { command: "py", args: ["-3"] }
  ];

  let lastError = null;

  for (const candidate of candidates) {
    try {
      if (candidate.command.includes("\\") && !existsSync(candidate.command)) {
        continue;
      }

      await execFile(candidate.command, [...candidate.args, exporterScript, inputPath, outputPath, title], {
        maxBuffer: 10 * 1024 * 1024
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Unable to locate a Python runtime for XLSX export.");
}

export async function buildXlsxBuffer(rows, title = "Registrations") {
  const tempDir = await mkdtemp(join(tmpdir(), "ppf26-export-"));
  const inputPath = join(tempDir, "rows.json");
  const outputPath = join(tempDir, "registrations.xlsx");

  try {
    await writeFile(inputPath, JSON.stringify(rows, null, 2), "utf8");
    await runPythonExporter(inputPath, outputPath, title);
    return await readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
