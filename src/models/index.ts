/**
 * MongoDB Models — نماذج قاعدة البيانات
 * كل نموذج يحتوي على store_id لعزل بيانات كل متجر (Multi-Tenant)
 */
import mongoose, { Schema, Document } from "mongoose";

// ── Store (المتجر) ────────────────────────────────────────────────────────────
export interface IStore extends Document {
  nameAr: string; nameEn: string; category: string;
  owner: string; email: string; password: string; phone: string; city: string;
  status: "active" | "suspended" | "expired" | "trial";
  plan: string; taxNo?: string;
  vatRate: number; currency: string; language: string;
  expiresAt: Date; createdAt: Date;
}
const StoreSchema = new Schema<IStore>({
  nameAr: { type: String, required: true },
  nameEn: { type: String, default: "" },
  category: { type: String, required: true, enum: ["supermarket","clothing","cafe","electronics","barber"] },
  owner: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },   // bcrypt hashed
  phone: { type: String, default: "" },
  city: { type: String, default: "" },
  status: { type: String, default: "trial", enum: ["active","suspended","expired","trial"] },
  plan: { type: String, default: "مبتدئ" },
  taxNo: { type: String, default: "" },
  vatRate: { type: Number, default: 0.16 },
  currency: { type: String, default: "JOD" },
  language: { type: String, default: "ar" },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
}, { timestamps: true });
export const Store = mongoose.model<IStore>("Store", StoreSchema);

// ── Product (المنتج) — multi-tenant بـ storeId ────────────────────────────────
export interface IProduct extends Document {
  storeId: mongoose.Types.ObjectId;
  nameAr: string; nameEn: string; barcode: string; sku: string;
  category: string; costPrice: number; sellPrice: number;
  stock: number; minStock: number; image: string; unit: string;
  brand?: string; taxable: boolean;
  offData?: object;  // Open Food Facts data
}
const ProductSchema = new Schema<IProduct>({
  storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  nameAr: { type: String, required: true },
  nameEn: { type: String, default: "" },
  barcode: { type: String, default: "" },
  sku: { type: String, default: "" },
  category: { type: String, default: "" },
  costPrice: { type: Number, default: 0 },
  sellPrice: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  minStock: { type: Number, default: 5 },
  image: { type: String, default: "" },
  unit: { type: String, default: "قطعة" },
  brand: { type: String, default: "" },
  taxable: { type: Boolean, default: true },
  offData: { type: Object, default: null },  // Open Food Facts raw data
}, { timestamps: true });
ProductSchema.index({ storeId: 1, barcode: 1 });
ProductSchema.index({ storeId: 1, sku: 1 });
export const Product = mongoose.model<IProduct>("Product", ProductSchema);

// ── Sale (الفاتورة) ────────────────────────────────────────────────────────────
export interface ISale extends Document {
  storeId: mongoose.Types.ObjectId;
  invoiceNo: string;
  items: { productId: string; nameAr: string; qty: number; unitPrice: number; discount: number; total: number }[];
  subtotal: number; discountAmt: number; taxAmt: number; total: number;
  payMethod: "cash" | "click" | "split";
  cashIn?: number; change?: number; status: "completed" | "refunded" | "held";
  cashier?: string; branchId?: string; terminalId?: string;
}
const SaleSchema = new Schema<ISale>({
  storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  invoiceNo: { type: String, required: true },
  items: [{ productId: String, nameAr: String, qty: Number, unitPrice: Number, discount: Number, total: Number }],
  subtotal: Number, discountAmt: Number, taxAmt: Number, total: { type: Number, required: true },
  payMethod: { type: String, enum: ["cash","click","split"], default: "cash" },
  cashIn: Number, change: Number,
  status: { type: String, default: "completed", enum: ["completed","refunded","held"] },
  cashier: String, branchId: String, terminalId: String,
}, { timestamps: true });
SaleSchema.index({ storeId: 1, createdAt: -1 });
export const Sale = mongoose.model<ISale>("Sale", SaleSchema);

// ── Customer (العميل) ─────────────────────────────────────────────────────────
export interface ICustomer extends Document {
  storeId: mongoose.Types.ObjectId;
  name: string; phone: string; email?: string;
  loyaltyPoints: number; level: string; totalPurchases: number;
}
const CustomerSchema = new Schema<ICustomer>({
  storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  name: { type: String, required: true },
  phone: { type: String, default: "" },
  email: { type: String, default: "" },
  loyaltyPoints: { type: Number, default: 0 },
  level: { type: String, default: "عادي" },
  totalPurchases: { type: Number, default: 0 },
}, { timestamps: true });
export const Customer = mongoose.model<ICustomer>("Customer", CustomerSchema);

// ── Expense (المصروف) ─────────────────────────────────────────────────────────
export interface IExpense extends Document {
  storeId: mongoose.Types.ObjectId;
  desc: string; amount: number; cat: string; method: string; date: Date; note?: string;
}
const ExpenseSchema = new Schema<IExpense>({
  storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  desc: { type: String, required: true },
  amount: { type: Number, required: true },
  cat: { type: String, default: "عام" },
  method: { type: String, default: "نقدي" },
  date: { type: Date, default: Date.now },
  note: String,
}, { timestamps: true });
export const Expense = mongoose.model<IExpense>("Expense", ExpenseSchema);

// ── SubscriptionPlan (خطة الاشتراك) ──────────────────────────────────────────
export interface IPlan extends Document {
  nameAr: string; price: number; yearlyPrice: number;
  maxBranches: number; maxUsers: number; maxProducts: number;
  maxInvoices: number; maxTerminals: number; storage: string;
  apiAccess: boolean; features: string[]; color: string; active: boolean;
}
const PlanSchema = new Schema<IPlan>({
  nameAr: { type: String, required: true },
  price: { type: Number, required: true },
  yearlyPrice: { type: Number, required: true },
  maxBranches: { type: Number, default: 1 },
  maxUsers: { type: Number, default: 3 },
  maxProducts: { type: Number, default: 500 },
  maxInvoices: { type: Number, default: 1000 },
  maxTerminals: { type: Number, default: 1 },
  storage: { type: String, default: "1 GB" },
  apiAccess: { type: Boolean, default: false },
  features: [String],
  color: { type: String, default: "#1D4ED8" },
  active: { type: Boolean, default: true },
}, { timestamps: true });
export const Plan = mongoose.model<IPlan>("Plan", PlanSchema);

// ── AuditLog (سجل التدقيق) ───────────────────────────────────────────────────
export interface IAuditLog extends Document {
  storeId?: mongoose.Types.ObjectId;
  user: string; action: string; target: string;
  ip?: string; device?: string;
}
const AuditLogSchema = new Schema<IAuditLog>({
  storeId: { type: Schema.Types.ObjectId, ref: "Store", index: true },
  user: String, action: String, target: String,
  ip: String, device: String,
}, { timestamps: true });
export const AuditLog = mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
