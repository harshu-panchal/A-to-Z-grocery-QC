import { describe, test, expect } from "@jest/globals";
import { stockRows, stockLevel } from "../modules/seller/utils/stockListPdf.js";

const products = [
  { name: "Amul Butter", brand: "Amul", lowStockAlert: 5, variants: [{ name: "500g", sku: "B500", stock: 2 }, { name: "100g", sku: "B100", stock: 20 }] },
  { name: "Amul Ghee", brand: "Amul", weight: "1 L", stock: 0, lowStockAlert: 3, variants: [] },
  { name: "Aashirvaad Atta", brand: "Aashirvaad", weight: "5 kg", stock: 9, lowStockAlert: 5 },
];

describe("stock list for re-ordering", () => {
  test("one row per size, sorted by brand then product", () => {
    const rows = stockRows(products);
    expect(rows.map((r) => `${r.brand}|${r.name}|${r.size}|${r.stock}`)).toEqual([
      "Aashirvaad|Aashirvaad Atta|5 kg|9",
      "Amul|Amul Butter|100g|20",
      "Amul|Amul Butter|500g|2",
      "Amul|Amul Ghee|1 L|0",
    ]);
  });

  test("low and out-of-stock rows are marked", () => {
    const rows = stockRows(products);
    expect(rows.map(stockLevel)).toEqual(["ok", "ok", "low", "out"]);
  });
});
