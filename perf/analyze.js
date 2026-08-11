function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const file = process.argv[2];
if (!file) {
  console.error("usage: node perf/analyze.js <results.jtl>");
  process.exit(1);
}

const rows = parseCsv(require("node:fs").readFileSync(file, "utf8"));
const header = rows[0];
const col = (name) => header.indexOf(name);
const iLabel = col("label");
const iCode = col("responseCode");
const iElapsed = col("elapsed");
const iSuccess = col("success");
const iTs = col("timeStamp");

const samples = rows
  .slice(1)
  .filter((r) => r.length > iElapsed && r[iLabel])
  .map((r) => ({
    label: r[iLabel],
    code: r[iCode],
    elapsed: Number(r[iElapsed]),
    ok: r[iSuccess] === "true",
    ts: Number(r[iTs]),
  }));

const pct = (sorted, q) =>
  sorted.length === 0
    ? 0
    : sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)];

const byLabel = new Map();
for (const s of samples) {
  if (!byLabel.has(s.label)) byLabel.set(s.label, []);
  byLabel.get(s.label).push(s);
}

const pad = (v, n) => String(v).padStart(n);
console.log(`\n${file}`);
console.log(
  `${"endpoint".padEnd(34)}${pad("n", 6)}${pad("ok%", 7)}${pad("p50", 8)}${pad("p95", 8)}${pad("p99", 8)}${pad("max", 8)}`,
);
console.log("-".repeat(79));

for (const [label, list] of byLabel) {
  const times = list.map((s) => s.elapsed).sort((a, b) => a - b);
  const ok = list.filter((s) => s.ok).length;
  console.log(
    label.padEnd(34) +
      pad(list.length, 6) +
      pad(((ok / list.length) * 100).toFixed(1), 7) +
      pad(pct(times, 0.5), 8) +
      pad(pct(times, 0.95), 8) +
      pad(pct(times, 0.99), 8) +
      pad(times[times.length - 1], 8),
  );
  const codes = new Map();
  for (const s of list) codes.set(s.code, (codes.get(s.code) ?? 0) + 1);
  const spread = [...codes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c}:${n}`)
    .join("  ");
  console.log(`${" ".repeat(4)}${spread}`);
}

const start = Math.min(...samples.map((s) => s.ts));
const end = Math.max(...samples.map((s) => s.ts + s.elapsed));
const seconds = (end - start) / 1000;
console.log("-".repeat(79));
console.log(
  `total ${samples.length} samples in ${seconds.toFixed(1)}s ` +
    `= ${(samples.length / seconds).toFixed(1)} req/s, ` +
    `${((samples.filter((s) => s.ok).length / samples.length) * 100).toFixed(1)}% ok`,
);
