/**
 * Business Rules Engine — محرك قواعد الأعمال المركزي
 *
 * All critical business validations live here.
 * Import and call these from routes — never duplicate the logic.
 */
import { ClientSession } from "mongoose";
import { Product, Sale, Store } from "../models/index";

export interface RuleError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface StockCheckItem {
  productId: string;
  qty: number;
  nameAr?: string;
}

// ── Stock Rules ───────────────────────────────────────────────────────────────

/**
 * Validate that every item has sufficient stock.
 * Returns an array of errors (empty = all good).
 * Uses the session for transaction consistency.
 */
export async function validateStock(
  storeId: string,
  items: StockCheckItem[],
  session?: ClientSession
): Promise<RuleError[]> {
  const errors: RuleError[] = [];
  for (const item of items) {
    const product = await Product.findOne(
      { _id: item.productId, storeId },
      { session }
    ).select("nameAr stock allowNegativeStock");
    if (!product) {
      errors.push({
        code: "PRODUCT_NOT_FOUND",
        message: `المنتج غير موجود: ${item.nameAr || item.productId}`,
        details: { productId: item.productId },
      });
      continue;
    }
    if (!product.allowNegativeStock && product.stock < item.qty) {
      errors.push({
        code: "INSUFFICIENT_STOCK",
        message: `الكمية المتاحة من "${product.nameAr}" هي ${product.stock} وحدة فقط (طُلب: ${item.qty})`,
        details: { productId: item.productId, available: product.stock, requested: item.qty },
      });
    }
  }
  return errors;
}

/**
 * Atomically deduct stock — uses $inc with a floor guard.
 * Returns the updated product or throws if stock went negative.
 */
export async function deductStock(
  storeId: string,
  items: StockCheckItem[],
  session?: ClientSession
): Promise<void> {
  for (const item of items) {
    const updated = await Product.findOneAndUpdate(
      { _id: item.productId, storeId, stock: { $gte: item.qty } },
      { $inc: { stock: -item.qty } },
      { new: true, session }
    );
    if (!updated) {
      // Check if it's because the product is gone or stock insufficient
      const product = await Product.findOne(
        { _id: item.productId, storeId },
        { session }
      ).select("nameAr stock allowNegativeStock");
      if (!product) throw ruleError("PRODUCT_NOT_FOUND", `المنتج غير موجود: ${item.productId}`);
      if (product.allowNegativeStock) {
        // Force deduction for stores that allow negative stock
        await Product.findOneAndUpdate({ _id: item.productId, storeId }, { $inc: { stock: -item.qty } }, { session });
      } else {
        throw ruleError(
          "INSUFFICIENT_STOCK",
          `نفد المخزون: "${product.nameAr}" — المتاح: ${product.stock}, المطلوب: ${item.qty}`,
          { productId: item.productId, available: product.stock, requested: item.qty }
        );
      }
    }
  }
}

/**
 * Restore stock (for void/return operations).
 */
export async function restoreStock(
  storeId: string,
  items: StockCheckItem[],
  session?: ClientSession
): Promise<void> {
  for (const item of items) {
    await Product.findOneAndUpdate(
      { _id: item.productId, storeId },
      { $inc: { stock: item.qty } },
      { session }
    );
  }
}

// ── Invoice Rules ─────────────────────────────────────────────────────────────

/**
 * Generate a unique, collision-safe invoice number.
 * Uses a timestamp + random suffix to avoid race conditions with countDocuments.
 */
export async function generateInvoiceNo(storeId: string, session?: ClientSession): Promise<string> {
  const year = new Date().getFullYear();
  // Use timestamp + random for uniqueness without counting race
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  const candidate = `INV-${year}-${ts}${rand}`;
  // Verify it doesn't exist (virtually impossible but ensures integrity)
  const exists = await Sale.exists({ storeId, invoiceNo: candidate });
  if (exists) {
    // Extremely rare: retry with different random
    return generateInvoiceNo(storeId, session);
  }
  return candidate;
}

// ── Store Status Rules ────────────────────────────────────────────────────────

/**
 * Ensure a store is active and not expired before allowing transactions.
 */
export async function assertStoreActive(storeId: string): Promise<void> {
  const store = await Store.findById(storeId, "status expiresAt");
  if (!store) throw ruleError("STORE_NOT_FOUND", "المتجر غير موجود");
  if (store.status === "suspended") throw ruleError("STORE_SUSPENDED", "المتجر موقوف");
  if (store.status === "expired" || new Date(store.expiresAt) < new Date()) {
    throw ruleError("STORE_EXPIRED", "انتهت صلاحية اشتراك المتجر");
  }
}

// ── Financial Rules ───────────────────────────────────────────────────────────

export interface SaleItem {
  unitPrice: number;
  qty: number;
  discount: number;   // per-item discount %
  taxRate?: number;   // per-item tax rate % (overrides store rate)
}

export interface SaleTotals {
  subtotal: number;
  itemDiscountAmt: number;
  invoiceDiscountAmt: number;
  taxAmt: number;
  total: number;
}

/**
 * Recalculate sale totals on the backend — authoritative numbers.
 * Frontend previews may differ due to rounding; backend totals win.
 */
export function recalculateSale(
  items: SaleItem[],
  invoiceDiscountPct: number,
  storeTaxRate: number   // fraction e.g. 0.16
): SaleTotals {
  const subtotal = items.reduce((acc, i) => acc + i.unitPrice * i.qty, 0);
  const itemDiscountAmt = items.reduce((acc, i) => acc + i.unitPrice * i.qty * (i.discount / 100), 0);
  const afterItemDiscount = subtotal - itemDiscountAmt;
  const invoiceDiscountAmt = afterItemDiscount * (invoiceDiscountPct / 100);
  const afterAllDiscounts = afterItemDiscount - invoiceDiscountAmt;

  // Per-item tax
  const taxAmt = items.reduce((acc, i) => {
    const lineNet = i.unitPrice * i.qty * (1 - i.discount / 100) * (1 - invoiceDiscountPct / 100);
    const rate = i.taxRate !== undefined ? i.taxRate / 100 : storeTaxRate;
    return acc + lineNet * rate;
  }, 0);

  const total = round3(afterAllDiscounts + taxAmt);
  return {
    subtotal: round3(subtotal),
    itemDiscountAmt: round3(itemDiscountAmt),
    invoiceDiscountAmt: round3(invoiceDiscountAmt),
    taxAmt: round3(taxAmt),
    total,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function ruleError(code: string, message: string, details?: Record<string, unknown>): Error & RuleError {
  const err = new Error(message) as Error & RuleError;
  err.code = code;
  err.message = message;
  if (details) err.details = details;
  return err;
}
