import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("root document suppresses only extension-mutated html hydration attributes", async () => {
  const layout = await fs.readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  const longform = await fs.readFile(new URL("../src/app/longform/page.tsx", import.meta.url), "utf8");

  assert.match(
    layout,
    /<html\b[^>]*\bsuppressHydrationWarning\b/,
    "Root <html> must tolerate browser-extension attribute mutations before hydration.",
  );
  assert.doesNotMatch(
    layout,
    /<body\b[^>]*\bsuppressHydrationWarning\b/,
    "Do not suppress hydration warnings below the document root unless a separate body mismatch requires it.",
  );
  assert.doesNotMatch(
    longform,
    /\bsuppressHydrationWarning\b/,
    "Longform controls must render deterministically instead of suppressing hydration warnings.",
  );
});
