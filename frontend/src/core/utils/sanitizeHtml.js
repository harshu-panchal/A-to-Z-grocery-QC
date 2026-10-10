import DOMPurify from "dompurify";

// Links in rich text open safely: no window.opener access for the target.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/**
 * Sanitize server-provided HTML before passing it to dangerouslySetInnerHTML.
 * Strips scripts, event handlers (onerror=...), javascript: URLs, iframes,
 * forms and styles while keeping ordinary rich-text formatting.
 */
export function sanitizeHtml(html) {
  if (!html) return "";
  return DOMPurify.sanitize(String(html), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe"],
    ADD_ATTR: ["target"],
  });
}
