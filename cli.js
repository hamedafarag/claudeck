#!/usr/bin/env node
import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createInterface } from "readline";
import crypto from "crypto";

const DEFAULT_PORT = 9009;
const envDir = process.env.CLAUDECK_HOME || join(homedir(), ".claudeck");
const envPath = join(envDir, ".env");
mkdirSync(envDir, { recursive: true });

function readEnv() {
  try { return readFileSync(envPath, "utf-8"); } catch { return ""; }
}

function saveEnvVar(key, value) {
  let content = readEnv();
  const re = new RegExp(`^${key}=.*`, "m");
  if (re.test(content)) {
    content = content.replace(re, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  writeFileSync(envPath, content);
}

function savePort(port) {
  saveEnvVar("PORT", port);
}

function getSavedPort() {
  const match = readEnv().match(/^PORT=(\d+)/m);
  return match ? match[1] : null;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

function handleAuthFlags() {
  // --no-auth: explicitly disable for this run
  if (process.argv.includes("--no-auth")) {
    process.env.CLAUDECK_AUTH = "false";
    return;
  }

  // --token <value> or --token=<value>: set custom token + enable auth
  const tokenArg = process.argv.find(a => a.startsWith("--token"));
  if (tokenArg) {
    const token = tokenArg.includes("=")
      ? tokenArg.split("=")[1]
      : process.argv[process.argv.indexOf(tokenArg) + 1];
    if (token) {
      process.env.CLAUDECK_TOKEN = token;
      process.env.CLAUDECK_AUTH = "true";
      saveEnvVar("CLAUDECK_TOKEN", token);
      saveEnvVar("CLAUDECK_AUTH", "true");
      console.log(`\x1b[2m  Auth token set and saved to ~/.claudeck/.env\x1b[0m`);
    }
    return;
  }

  // --auth: enable auth, auto-generate token if missing
  if (process.argv.includes("--auth")) {
    process.env.CLAUDECK_AUTH = "true";
    const envContent = readEnv();
    const existingToken = envContent.match(/^CLAUDECK_TOKEN=(.+)/m);
    if (existingToken) {
      process.env.CLAUDECK_TOKEN = existingToken[1];
    } else {
      const token = crypto.randomBytes(32).toString("hex");
      process.env.CLAUDECK_TOKEN = token;
      saveEnvVar("CLAUDECK_TOKEN", token);
      saveEnvVar("CLAUDECK_AUTH", "true");
      console.log(`\x1b[2m  Generated auth token and saved to ~/.claudeck/.env\x1b[0m`);
    }
  }
}

async function main() {
  // Handle auth flags before anything else
  handleAuthFlags();

  // --port flag takes priority
  const portArg = process.argv.find(a => a.startsWith('--port'));
  if (portArg) {
    const port = portArg.includes('=') ? portArg.split('=')[1] : process.argv[process.argv.indexOf(portArg) + 1];
    if (port) {
      process.env.PORT = port;
      savePort(port);
      return import("./server.js");
    }
  }

  // If port already saved, use it
  const saved = getSavedPort();
  if (saved) {
    process.env.PORT = saved;
    return import("./server.js");
  }

  // First run — ask user
  console.log(`\n\x1b[36m  Claudeck\x1b[0m — first-time setup\n`);
  const answer = await ask(`  Which port would you like to use? \x1b[2m(default: ${DEFAULT_PORT})\x1b[0m `);
  const port = answer && /^\d+$/.test(answer) ? answer : String(DEFAULT_PORT);
  process.env.PORT = port;
  savePort(port);
  console.log(`\x1b[2m  Saved to ~/.claudeck/.env\x1b[0m\n`);
  return import("./server.js");
}

main();
