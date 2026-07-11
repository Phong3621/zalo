import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

function dbPath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

export function loadDB(name) {
  const p = dbPath(name);
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

export function saveDB(name, data) {
  fs.writeFileSync(dbPath(name), JSON.stringify(data, null, 2), "utf-8");
}

export function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function getMonthKey() {
  return new Date().toISOString().slice(0, 7);
}
