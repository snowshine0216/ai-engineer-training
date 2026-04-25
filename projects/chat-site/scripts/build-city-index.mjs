// scripts/build-city-index.mjs
// Reads data/AMap_adcode_citycode.xlsx, picks columns 中文名 + adcode, writes
// lib/tools/amap-cities.json sorted by name length DESC (longer names first
// so substring matches prefer the more specific candidate).
import * as XLSX from "xlsx/xlsx.mjs";
import * as fs from "fs";
import * as path from "path";

// Required for xlsx ESM build to access the filesystem
XLSX.set_fs(fs);

const SRC = "data/AMap_adcode_citycode.xlsx";
const DEST = "lib/tools/amap-cities.json";

let wb;
try {
  wb = XLSX.readFile(SRC);
} catch (e) {
  console.error(`error: cannot read "${SRC}": ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
const sheetName = wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });

if (rows.length === 0) {
  console.error(`error: sheet "${sheetName}" is empty`);
  process.exit(1);
}

const sample = rows[0];
const hasName = Object.hasOwn(sample, "中文名");
const hasAdcode = Object.hasOwn(sample, "adcode");
if (!hasName || !hasAdcode) {
  console.error(
    `error: expected columns "中文名" and "adcode"; got ${JSON.stringify(Object.keys(sample))}`
  );
  process.exit(1);
}

const cities = rows
  .map((r) => ({ name: String(r["中文名"]).trim(), adcode: String(r["adcode"]).trim() }))
  .filter((r) => r.name && r.adcode)
  .sort((a, b) => b.name.length - a.name.length);

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.writeFileSync(DEST, JSON.stringify(cities, null, 0) + "\n");

console.log(`wrote ${cities.length} cities → ${DEST}`);
