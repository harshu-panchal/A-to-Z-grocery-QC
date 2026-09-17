/**
 * Lightweight HTML allowlist sanitizer for legal page content.
 * Allows headings, paragraphs, lists, links, bold/italic; strips scripts/styles/events.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "a",
  "u",
  "span",
  "div",
]);

const VOID_TAGS = new Set(["br"]);

function stripTags(html) {
  return String(html || "")
    .replace(/<\s*script[\s\S]*?>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*style[\s\S]*?>[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

function sanitizeAttributes(tag, attrString) {
  if (tag === "a") {
    const hrefMatch = attrString.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    let href = hrefMatch
      ? (hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? "").trim()
      : "";
    // Only allow http(s), mailto, or relative paths
    if (
      href &&
      !/^(https?:\/\/|mailto:|\/|#)/i.test(href) &&
      !href.startsWith("/")
    ) {
      href = "";
    }
    if (/^\s*javascript:/i.test(href)) href = "";
    return href ? ` href="${href.replace(/"/g, "&quot;")}" rel="noopener noreferrer" target="_blank"` : "";
  }
  return "";
}

/**
 * @param {string} dirtyHtml
 * @returns {string}
 */
export function sanitizeLegalHtml(dirtyHtml) {
  const cleaned = stripTags(dirtyHtml);
  if (!cleaned.trim()) return "";

  return cleaned.replace(
    /<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g,
    (match, rawTag, attrs = "") => {
      const tag = String(rawTag || "").toLowerCase();
      const isClosing = match.startsWith("</");

      if (!ALLOWED_TAGS.has(tag)) {
        return "";
      }

      if (isClosing) {
        return VOID_TAGS.has(tag) ? "" : `</${tag}>`;
      }

      if (VOID_TAGS.has(tag)) {
        return `<${tag}>`;
      }

      const safeAttrs = sanitizeAttributes(tag, attrs || "");
      return `<${tag}${safeAttrs}>`;
    },
  );
}

export default sanitizeLegalHtml;
