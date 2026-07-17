import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const appSource = read("app.js");
const swSource = read("sw.js");
const indexSource = read("index.html");

// Syntax and basic document references.
new vm.Script(appSource, { filename: "app.js" });
new vm.Script(swSource, { filename: "sw.js" });
JSON.parse(read("manifest.webmanifest"));
for (const file of ["style.css", "app.js", "data-2026-07.js", "manifest.webmanifest"]) {
  assert(indexSource.includes(file), `index.html does not reference ${file}`);
  assert(fs.existsSync(path.join(root, file)), `Missing document asset: ${file}`);
}

// Every local service-worker asset must exist.
const cachedAssets = [...swSource.matchAll(/"\.\/([^"?]+)"/g)].map((match) => match[1]);
for (const asset of cachedAssets) {
  if (!asset) continue;
  assert(fs.existsSync(path.join(root, asset)), `Missing service-worker asset: ${asset}`);
}

// Load the monthly module in isolation and reuse the actual mealImage function.
const dataContext = { window: {} };
vm.createContext(dataContext);
vm.runInContext(read("data-2026-07.js"), dataContext, { filename: "data-2026-07.js" });
const month = dataContext.window.ZHARAVA_MONTHS["2026-07"];
assert(month?.meals?.length === 7, "Expected a seven-day meal plan");

const imageFunctionSource = appSource.match(/function mealImage\(meal\) \{[\s\S]*?\n\}/)?.[0];
assert(imageFunctionSource, "mealImage() was not found in app.js");
const mealImage = vm.runInNewContext(`(${imageFunctionSource})`);
const meals = month.meals.flat();
assert(meals.length === 28, `Expected 28 meals, found ${meals.length}`);

const assignedAssets = new Set();
for (const meal of meals) {
  const asset = mealImage(meal);
  assignedAssets.add(asset);
  const absolute = path.join(root, asset);
  assert(fs.existsSync(absolute), `Missing meal image for "${meal.n}": ${asset}`);
  assert(fs.statSync(absolute).size < 200_000, `Meal image is too large: ${asset}`);
}

console.log(`Smoke checks passed: ${meals.length} meals -> ${assignedAssets.size} reusable images; ${cachedAssets.length} cached assets.`);
