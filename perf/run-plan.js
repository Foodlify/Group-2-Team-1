/**
 * Runs a JMeter plan with the item id from the last seed.
 *
 * The plans can't hard-code the menu item: `perf/seed-load.ts` truncates and
 * recreates everything, so the cuids change on every seed. This reads
 * `perf/data/items.csv` and passes the right one through as a JMeter property.
 *
 * Usage: node perf/run-plan.js <1|2|3> [--users 500] [--rampup 10] [--run 1]
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PLANS = {
  1: { file: "01-baseline-order-flow.jmx", item: "regularItemId", rampup: 10 },
  2: { file: "02-stock-contention.jmx", item: "scarceItemId", rampup: 5 },
  // Login needs no menu item — it never reaches the catalog.
  3: { file: "03-login.jmx", item: null, rampup: 10 },
  // Reports read across the catalog; the restaurant id comes from
  // dashboard.csv, written by the dashboard seed.
  4: { file: "04-dashboard.jmx", item: null, rampup: 5 },
};

const which = process.argv[2];
const plan = PLANS[which];
if (!plan) {
  console.error(
    "usage: node perf/run-plan.js <1|2> [--users N] [--rampup N] [--run N]",
  );
  process.exit(1);
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const perfDir = __dirname;
const itemsFile = path.join(perfDir, "data", "items.csv");
if (!fs.existsSync(itemsFile)) {
  console.error(`${itemsFile} is missing — run \`npm run perf:seed\` first.`);
  process.exit(1);
}

const [header, values] = fs
  .readFileSync(itemsFile, "utf8")
  .trim()
  .split(/\r?\n/)
  .map((line) => line.split(","));
const itemId = plan.item ? values[header.indexOf(plan.item)] : "";

const runNo = arg("run", "1");
const resultsDir = path.join(perfDir, "results");
fs.mkdirSync(resultsDir, { recursive: true });
const out = path.join(resultsDir, `plan${which}-run${runNo}.jtl`);
fs.rmSync(out, { force: true });

// Forward slashes: JMeter reads this as a property, and a Windows path with
// backslashes would be mangled by its variable syntax.
const posix = (p) => p.split(path.sep).join("/");

const args = [
  "-n",
  "-t",
  path.join(perfDir, "plans", plan.file),
  "-l",
  out,
  `-Jhost=${arg("host", "localhost")}`,
  `-Jport=${arg("port", "4444")}`,
  `-Jusers=${arg("users", which === "4" ? "20" : "500")}`,
  `-Jloops=${arg("loops", "5")}`,
  `-Jrampup=${arg("rampup", String(plan.rampup))}`,
  `-JitemId=${itemId}`,
  `-JdataDir=${posix(path.join(perfDir, "data"))}`,
];

console.log(`Plan ${which}${itemId ? ` — item ${itemId}` : ""}`);
const result = spawnSync("jmeter", args, { stdio: "inherit", shell: true });
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`\nResults: ${out}`);
spawnSync("node", [path.join(perfDir, "analyze.js"), out], {
  stdio: "inherit",
  shell: true,
});
