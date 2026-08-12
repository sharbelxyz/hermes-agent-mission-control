import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src/app/api/hermes");
const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const failures = [];

function routeFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.isFile() && entry.name === "route.ts" ? [path] : [];
  });
}

function findMatchingBrace(source, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findMatchingParen(source, openParenIndex) {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

for (const file of routeFiles(root)) {
  const source = readFileSync(file, "utf8");
  const exportPattern = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g;
  let match;

  while ((match = exportPattern.exec(source))) {
    const method = match[1];
    if (!mutationMethods.has(method)) continue;

    const openParenIndex = source.indexOf("(", match.index);
    const closeParenIndex = findMatchingParen(source, openParenIndex);
    const openBraceIndex = source.indexOf("{", closeParenIndex);
    const closeBraceIndex = findMatchingBrace(source, openBraceIndex);
    const body = closeBraceIndex === -1 ? "" : source.slice(openBraceIndex, closeBraceIndex + 1);

    if (!source.includes("requireInternalApiSecret") || !body.includes("requireInternalApiSecret(req)")) {
      failures.push(`${file.replace(`${process.cwd()}/`, "")} ${method}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Hermes mutation handlers missing INTERNAL_API_SECRET protection:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("All Hermes mutation handlers require INTERNAL_API_SECRET.");
