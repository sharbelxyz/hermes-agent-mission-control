export function redactText(value, secrets = []) {
  let text = String(value || "");
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 8) {
      text = text.split(secret).join("[redacted]");
    }
  }
  return text
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, "[redacted]")
    .replace(/(api[_-]?key|secret|token|password|authorization|bearer)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .slice(0, 2000);
}

export function looksSecret(value) {
  const text = String(value || "");
  return /(api[_-]?key|secret|token|password|authorization|bearer\s+|sk-[a-z0-9])/i.test(text);
}
