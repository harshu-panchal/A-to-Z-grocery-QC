/**
 * Print HTML in a hidden iframe (the app's own layout/CSS can't leak in).
 *
 * pageWidthMm: print on paper exactly as big as the content, e.g. an 80mm
 * bill. The content is laid out at that width, measured, and the page height
 * set to match. (`@page { size: 80mm auto }` is not valid CSS, so browsers
 * ignore it and fall back to a full A4/Letter page.)
 */
export const escHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const PX_PER_MM = 96 / 25.4;

export function printHtml(bodyHtml, { css = "", title = "Print", pageWidthMm = null } = {}) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = pageWidthMm
    ? `position:fixed;left:-10000px;top:0;width:${pageWidthMm}mm;height:10px;border:0;visibility:hidden`
    : "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  const go = () => {
    if (pageWidthMm) {
      const heightMm = Math.ceil(doc.documentElement.scrollHeight / PX_PER_MM) + 2;
      const page = doc.createElement("style");
      page.textContent = `@page { size: ${pageWidthMm}mm ${heightMm}mm; margin: 0; } html, body { width: ${pageWidthMm}mm; }`;
      doc.head.appendChild(page);
    }
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1500);
  };
  // wait for images (logo/QR) before measuring and printing
  const imgs = [...doc.images];
  if (!imgs.length) setTimeout(go, 50);
  else Promise.all(imgs.map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))).then(() => setTimeout(go, 50));
}

/**
 * Print receipt rows ({ text, bold }, fixed-width Courier) on a bill-sized
 * page. afterHtml goes below the rows (e.g. a QR code and the footer).
 */
export function printReceiptRows(rows, { widthMm = 80, columns = 48, title = "Receipt", afterHtml = "" } = {}) {
  const padMm = 2;
  // fit `columns` Courier characters (0.6em wide) across the printable width
  const fontPx = Math.min(11, ((widthMm - padMm * 2 - 1) * PX_PER_MM) / (columns * 0.6));
  const body = rows.map((r) => (r.bold ? `<b>${escHtml(r.text)}</b>` : escHtml(r.text))).join("\n");
  const css = `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { padding: ${padMm}mm; color: #000; }
    pre, .c { margin: 0; font: ${fontPx.toFixed(2)}px/1.3 "Courier New", Courier, monospace; }
    pre { white-space: pre; }
    .c { text-align: center; }
    img.qr { width: 32mm; height: 32mm; margin-top: 4px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`;
  printHtml(`<pre>${body}</pre>${afterHtml}`, { css, title, pageWidthMm: widthMm });
}
