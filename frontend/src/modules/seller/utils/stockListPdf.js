/**
 * Stock list PDF for re-ordering: the products the seller searched/filtered
 * (e.g. brand "Amul"), one row per size, with current stock and a blank
 * "Order qty" column to fill in for the supplier.
 */

/** One row per size (a product without sizes is one row). */
export function stockRows(products) {
  const rows = [];
  for (const p of products || []) {
    const threshold = Number(p.lowStockAlert || p.threshold || 5);
    const variants = Array.isArray(p.variants) ? p.variants.filter((v) => v && (v.name || v.sku)) : [];
    const base = { name: p.name || "", brand: p.brand || "", threshold };
    if (variants.length) {
      for (const v of variants) rows.push({ ...base, size: v.name || v.sku || "", stock: Number(v.stock) || 0 });
    } else {
      rows.push({ ...base, size: p.weight || p.unit || "", stock: Number(p.stock) || 0 });
    }
  }
  return rows.sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name) || a.size.localeCompare(b.size));
}

export const stockLevel = (row) => (row.stock <= 0 ? "out" : row.stock <= row.threshold ? "low" : "ok");

export async function downloadStockListPdf(products, { shopName = "", search = "", filter = "All" } = {}) {
  const rows = stockRows(products);
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const now = new Date();
  const when = `${now.toLocaleDateString("en-GB")} ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  const what = search.trim() ? `Stock list: "${search.trim()}"` : "Stock list: all products";

  doc.setFont("helvetica", "bold").setFontSize(15).text(shopName || "Stock list", 14, 15);
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(`${what}${filter && filter !== "All" ? ` (${filter})` : ""}`, 14, 21);
  doc.setTextColor(110).text(when, W - 14, 15, { align: "right" }).setTextColor(0);

  autoTable(doc, {
    startY: 26,
    head: [["#", "Product", "Size", "Brand", "In stock", "Order qty"]],
    body: rows.map((r, i) => [i + 1, r.name, r.size || "-", r.brand || "-", r.stock, ""]),
    styles: { fontSize: 9, cellPadding: 2, valign: "middle" },
    headStyles: { fillColor: [4, 117, 49] },
    columnStyles: {
      0: { cellWidth: 9, halign: "right" },
      4: { cellWidth: 20, halign: "right", fontStyle: "bold" },
      5: { cellWidth: 24 },
    },
    // highlight low / out of stock; give "Order qty" a box to write in
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const level = stockLevel(rows[data.row.index]);
      if (level === "out") data.cell.styles.fillColor = [254, 226, 226];
      else if (level === "low") data.cell.styles.fillColor = [254, 243, 199];
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        doc.setDrawColor(150);
        doc.rect(data.cell.x + 2, data.cell.y + 1.2, data.cell.width - 4, data.cell.height - 2.4);
      }
    },
  });

  const totalUnits = rows.reduce((s, r) => s + r.stock, 0);
  const low = rows.filter((r) => stockLevel(r) === "low").length;
  const out = rows.filter((r) => stockLevel(r) === "out").length;
  let y = doc.lastAutoTable.finalY + 7;
  if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold").setFontSize(10).text(`${rows.length} item(s) · ${totalUnits} unit(s) in stock`, 14, y);
  doc.setFont("helvetica", "normal").setFontSize(9).text(`Low stock: ${low}   Out of stock: ${out}   (yellow = low, red = out)`, 14, y + 5);

  const slug = (search.trim() || "all").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  doc.save(`stock-list-${slug || "all"}-${now.toISOString().slice(0, 10)}.pdf`);
  return rows.length;
}
