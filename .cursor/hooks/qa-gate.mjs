#!/usr/bin/env node
/**
 * QA gate for SAGE. Blocks git commit / git push / Vercel deploy until
 * `.qa-stamp.json` matches the current working tree fingerprint.
 *
 * CLI:
 *   (stdin hook payload)     beforeShellExecution gate
 *   --after                  refresh stamp after a successful git commit
 *   --stamp                  write a PASS stamp for the current tree
 *   --check                  exit 0 if stamp is valid, 1 otherwise
 *   --fingerprint            print the current fingerprint
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const STAMP_PATH = join(ROOT, ".qa-stamp.json");
const AFTER = process.argv.includes("--after");
const STAMP = process.argv.includes("--stamp");
const CHECK = process.argv.includes("--check");
const PRINT_FP = process.argv.includes("--fingerprint");

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}

function fingerprint() {
  const head = git(["rev-parse", "HEAD"]).trim();
  const status = git(["status", "--porcelain"]);
  const diff = git(["diff", "HEAD"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const untrackedHashes = untracked.map((file) => {
    try {
      const body = readFileSync(join(ROOT, file));
      return `${file}:${createHash("sha256").update(body).digest("hex")}`;
    } catch {
      return `${file}:missing`;
    }
  });
  const payload = [head, status, diff, untrackedHashes.join("\n")].join("\n---\n");
  return createHash("sha256").update(payload).digest("hex");
}

function readStamp() {
  if (!existsSync(STAMP_PATH)) return null;
  try {
    return JSON.parse(readFileSync(STAMP_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeStamp() {
  const stamp = {
    version: 1,
    status: "pass",
    fingerprint: fingerprint(),
    head: git(["rev-parse", "HEAD"]).trim(),
    at: new Date().toISOString(),
  };
  writeFileSync(STAMP_PATH, `${JSON.stringify(stamp, null, 2)}\n`);
  return stamp;
}

function stampValid() {
  const stamp = readStamp();
  if (!stamp || stamp.status !== "pass" || !stamp.fingerprint) return false;
  return stamp.fingerprint === fingerprint();
}

function reply(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function skipRequested(command) {
  if (process.env.QA_GATE_SKIP === "1") return true;
  return /(?:^|\s)QA_GATE_SKIP=1(?:\s|$)/.test(command);
}

function isHelpOrDryRun(command) {
  return /(?:^|\s)(--help|-h|--dry-run)(?:\s|$)/.test(command);
}

function isGitShip(command) {
  if (/\bgit\s+commit\b/.test(command)) return !isHelpOrDryRun(command);
  if (/\bgit\s+push\b/.test(command)) return !isHelpOrDryRun(command);
  return false;
}

function isVercelDeploy(command) {
  if (!/\b(?:npx\s+)?vercel\b/.test(command)) return false;
  if (isHelpOrDryRun(command)) return false;
  const nonDeploy =
    /\b(login|link|env|logs|inspect|ls|list|whoami|pull|integration|domains|dns|certs|alias|rm|remove|promote|rollback|git|init|switch|scope|teams|project|build|dev|blob|mcp)\b/;
  if (nonDeploy.test(command) && !/\s--prod\b/.test(command)) return false;
  return true;
}

function isGated(command) {
  return isGitShip(command) || isVercelDeploy(command);
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

function parsePayload(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function exitCodeOf(payload) {
  const value = payload.exitCode ?? payload.exit_code ?? payload.status;
  return typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
}

const DENY = {
  permission: "deny",
  user_message:
    "QA has not passed for the current changes. Ask the agent to run the QA review, or set QA_GATE_SKIP=1 to bypass.",
  agent_message:
    "Commit/deploy is blocked until QA passes for this working tree. Read and follow `.cursor/skills/qa-agent/SKILL.md`. After a PASS, run `node .cursor/hooks/qa-gate.mjs --stamp` (the skill does this) and retry. Do not set QA_GATE_SKIP unless the user explicitly asked to bypass QA.",
};

async function main() {
  if (PRINT_FP) {
    process.stdout.write(`${fingerprint()}\n`);
    return;
  }
  if (STAMP) {
    writeStamp();
    process.stderr.write(`QA stamp written: ${STAMP_PATH}\n`);
    return;
  }
  if (CHECK) {
    process.exit(stampValid() ? 0 : 1);
  }

  const payload = parsePayload(await readStdin());
  const command = String(payload.command ?? "");

  if (AFTER) {
    if (/\bgit\s+commit\b/.test(command) && exitCodeOf(payload) === 0 && readStamp()?.status === "pass") {
      writeStamp();
    }
    reply({});
    return;
  }

  if (!command || !isGated(command) || skipRequested(command)) {
    reply({ permission: "allow" });
    return;
  }

  if (stampValid()) {
    reply({ permission: "allow" });
    return;
  }

  reply(DENY);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  const hookMode = !STAMP && !CHECK && !PRINT_FP;
  if (hookMode) {
    // Fail open so a broken gate cannot freeze shipping; deny is explicit above.
    reply({ permission: "allow" });
    return;
  }
  process.exitCode = 1;
});
