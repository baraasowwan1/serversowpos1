/**
 * MongoDB Models — نماذج قاعدة البيانات
 * Multi-tenant: كل سجل مقيد بـ storeId
 */
import mongoose, { Schema, Document, Types } from "mongoose";

// ── Store ─────────────────────────────────────────────────────────────────────
export interface IStore extends Document {
  _id: Types.ObjectId;
  nameAr: string; nameEn: string; category: string;
  owner: string; email: string; phone: string; city: string;
  status: "active" | "suspended" | "expired" | "trial";
  plan: string; taxNo?: string;
  vatRate: number; currency: string; language: string;
  expiresAt: Date; createdAt: Date; updatedAt: Date;
  // White-label branding
  appName?: string;
  primaryColor?: string;
  logoUrl?: string;
  iconUrl?: string;
  splashLogoUrl?: string;
  receiptLogoUrl?: string;
  // Category-specific feature flags (set by migration, overridable by SA)
  openFoodFactsEnabled?: boolean;
}
const StoreSchema = new Schema<IStore>({
  nameAr:   { type: String, required: true },
  nameEn:   { type: String, default: "" },
  category: { type: String, required: true, enum: ["supermarket","clothing","cafe","electronics","barber","print_shop","flower_shop"] },
  owner:    { type: String, required: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:    { type: String, default: "" },
  city:     { type: String, default: "" },
  status:   { type: String, default: "trial", enum: ["active","suspended","expired","trial"] },
  plan:     { type: String, default: "مبتدئ" },
  taxNo:    { type: String, default: "" },
  vatRate:  { type: Number, default: 0.16 },
  currency: { type: String, default: "JOD" },
  language: { type: String, default: "ar" },
  expiresAt:{ type: Date, default: () => new Date(Date.now() + 14 * 86400000) },
  // White-label branding
  appName:        { type: String, default: "" },
  primaryColor:   { type: String, default: "" },
  logoUrl:        { type: String, default: "" },
  iconUrl:        { type: String, default: "" },
  splashLogoUrl:  { type: String, default: "" },
  receiptLogoUrl: { type: String, default: "" },
  openFoodFactsEnabled: { type: Boolean, default: false },
}, { timestamps: true });
export const Store = mongoose.model<IStore>("Store", StoreSchema);

// ── User (مستخدمو المتاجر) ────────────────────────────────────────────────────
// كل مستخدم مرتبط بمتجر عبر storeId — المصدر الوحيد للحقيقة
export interface IUser extends Document {
  _id: Types.ObjectId;
  storeId:    Types.ObjectId;   // tenant isolation
  branchId?:  Types.ObjectId;
  name:       string;
  email:      string;
  username?:  string;
  password:   string;           // bcrypt hash — لا تُخزَّن كلمة المرور الصريحة أبداً
  role:       "owner" | "manager" | "cashier" | "inventory" | "accountant";
  status:     "active" | "suspended";
  createdAt:  Date;
  updatedAt:  Date;
}
const UserSchema = new Schema<IUser>({
  storeId:  { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  branchId: { type: Schema.Types.ObjectId, ref: "Branch", default: null },
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  username: { type: String, default: "" },
  password: { type: String, required: true },  // bcrypt hash
  role:     { type: String, default: "owner", enum: ["owner","manager","cashier","inventory","accountant"] },
  status:   { type: String, default: "active", enum: ["active","suspended"] },
}, { timestamps: true });
UserSchema.index({ storeId: 1, email: 1 });
export const User = mongoose.model<IUser>("User", UserSchema);

// ── Product ───────────────────────────────────────────────────────────────────
export interface IProduct extends Document {
  storeId:   Types.ObjectId;
  nameAr:    string; nameEn: string; barcode: string; sku: string;
  category:  string; costPrice: number; sellPrice: number;
  stock:     number; minStock: number; image: string; unit: string;
  brand?:    string; taxable: boolean;
  offData?:  object;
}
const ProductSchema = new Schema<IProduct>({
  storeId:   { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  nameAr:    { type: String, required: true },
  nameEn:    { type: String, default: "" },
  barcode:   { type: String, default: "" },
  sku:       { type: String, default: "" },
  category:  { type: String, default: "" },
  costPrice: { type: Number, default: 0 },
  sellPrice: { type: Number, required: true },
  stock:     { type: Number, default: 0 },
  minStock:  { type: Number, default: 5 },
  image:     { type: String, default: "" },
  unit:      { type: String, default: "قطعة" },
  brand:     { type: String, default: "" },
  taxable:   { type: Boolean, default: true },
  offData:   { type: Object, default: null },
}, { timestamps: true });
ProductSchema.index({ storeId: 1, barcode: 1 });
ProductSchema.index({ storeId: 1, sku: 1 });
export const Product = mongoose.model<IProduct>("Product", ProductSchema);

// ── Sale ──────────────────────────────────────────────────────────────────────
export interface ISale extends Document {
  storeId:     Types.ObjectId;
  invoiceNo:   string;
  items:       { productId: string; nameAr: string; qty: number; unitPrice: number; discount: number; total: number }[];
  subtotal:    number; discountAmt: number; taxAmt: number; total: number;
  payMethod:   "cash" | "click" | "split";
  cashIn?:     number; change?: number;
  status:      "completed" | "refunded" | "held";
  cashier?:    string; branchId?: string; terminalId?: string;
}
const SaleSchema = new Schema<ISale>({
  storeId:    { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  invoiceNo:  { type: String, required: true },
  items:      [{ productId: String, nameAr: String, qty: Number, unitPrice: Number, discount: Number, total: Number }],
  subtotal:   Number, discountAmt: Number, taxAmt: Number,
  total:      { type: Number, required: true },
  payMethod:  { type: String, enum: ["cash","click","split"], default: "cash" },
  cashIn:     Number, change: Number,
  status:     { type: String, default: "completed", enum: ["completed","refunded","held"] },
  cashier:    String, branchId: String, terminalId: String,
}, { timestamps: true });
SaleSchema.index({ storeId: 1, createdAt: -1 });
export const Sale = mongoose.model<ISale>("Sale", SaleSchema);

// ── Customer ──────────────────────────────────────────────────────────────────
export interface ICustomer extends Document {
  storeId: Types.ObjectId;
  name: string; phone: string; email?: string;
  loyaltyPoints: number; level: string; totalPurchases: number;
}
const CustomerSchema = new Schema<ICustomer>({
  storeId:        { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  name:           { type: String, required: true },
  phone:          { type: String, default: "" },
  email:          { type: String, default: "" },
  loyaltyPoints:  { type: Number, default: 0 },
  level:          { type: String, default: "عادي" },
  totalPurchases: { type: Number, default: 0 },
}, { timestamps: true });
export const Customer = mongoose.model<ICustomer>("Customer", CustomerSchema);

// ── Expense ───────────────────────────────────────────────────────────────────
export interface IExpense extends Document {
  storeId: Types.ObjectId;
  desc: string; amount: number; cat: string; method: string; date: Date; note?: string;
}
const ExpenseSchema = new Schema<IExpense>({
  storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  desc:    { type: String, required: true },
  amount:  { type: Number, required: true },
  cat:     { type: String, default: "عام" },
  method:  { type: String, default: "نقدي" },
  date:    { type: Date, default: Date.now },
  note:    String,
}, { timestamps: true });
export const Expense = mongoose.model<IExpense>("Expense", ExpenseSchema);

// ── SubscriptionPlan ──────────────────────────────────────────────────────────
export interface IPlan extends Document {
  nameAr: string; price: number; yearlyPrice: number;
  maxBranches: number; maxUsers: number; maxProducts: number;
  maxInvoices: number; maxTerminals: number; storage: string;
  apiAccess: boolean; features: string[]; color: string; active: boolean;
}
const PlanSchema = new Schema<IPlan>({
  nameAr:      { type: String, required: true },
  price:       { type: Number, required: true },
  yearlyPrice: { type: Number, required: true },
  maxBranches: { type: Number, default: 1 },
  maxUsers:    { type: Number, default: 3 },
  maxProducts: { type: Number, default: 500 },
  maxInvoices: { type: Number, default: 1000 },
  maxTerminals:{ type: Number, default: 1 },
  storage:     { type: String, default: "1 GB" },
  apiAccess:   { type: Boolean, default: false },
  features:    [String],
  color:       { type: String, default: "#1D4ED8" },
  active:      { type: Boolean, default: true },
}, { timestamps: true });
export const Plan = mongoose.model<IPlan>("Plan", PlanSchema);

// ── AuditLog ──────────────────────────────────────────────────────────────────
export interface IAuditLog extends Document {
  storeId?: Types.ObjectId;
  userId?:  Types.ObjectId;
  user:     string; action: string; target: string;
  ip?:      string; device?: string;
}
const AuditLogSchema = new Schema<IAuditLog>({
  storeId: { type: Schema.Types.ObjectId, ref: "Store", index: true },
  userId:  { type: Schema.Types.ObjectId, ref: "User" },
  user:    String, action: String, target: String,
  ip:      String, device: String,
}, { timestamps: true });
export const AuditLog = mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);

// ── PrintMaterial (مواد الطباعة) ───────────────────────────────────────────────
export interface IPrintMaterial extends Document {
  storeId:    Types.ObjectId;
  branchId?:  Types.ObjectId;
  name:       string;
  type:       string;       // sticker_roll | vinyl | banner | flex | paper | ink | lamination | other
  unit:       string;       // meter | sqm | roll | sheet | piece | liter | box
  rollWidth?: number;       // meters
  rollLength?: number;      // meters
  totalArea?: number;       // sqm (auto-calculated for rolls)
  usedArea:   number;       // sqm consumed so far
  costPerUnit: number;      // JOD per unit
  supplier?:  string;
  minStock:   number;       // low-stock alert threshold
  status:     "active" | "low" | "out";
  createdBy?: Types.ObjectId;
}
const PrintMaterialSchema = new Schema<IPrintMaterial>({
  storeId:     { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  branchId:    { type: Schema.Types.ObjectId, ref: "Branch", default: null },
  name:        { type: String, required: true },
  type:        { type: String, default: "other" },
  unit:        { type: String, default: "sqm" },
  rollWidth:   { type: Number, default: 0 },
  rollLength:  { type: Number, default: 0 },
  totalArea:   { type: Number, default: 0 },
  usedArea:    { type: Number, default: 0 },
  costPerUnit: { type: Number, default: 0 },
  supplier:    { type: String, default: "" },
  minStock:    { type: Number, default: 5 },
  status:      { type: String, default: "active", enum: ["active","low","out"] },
  createdBy:   { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
PrintMaterialSchema.pre("save", function () {
  if (this.rollWidth && this.rollLength) {
    this.totalArea = this.rollWidth * this.rollLength;
  }
  const remaining = (this.totalArea || 0) - this.usedArea;
  this.status = remaining <= 0 ? "out" : remaining <= this.minStock ? "low" : "active";
});
export const PrintMaterial = mongoose.model<IPrintMaterial>("PrintMaterial", PrintMaterialSchema);

// ── PrintPriceList (قوائم أسعار الطباعة) ───────────────────────────────────────
export interface IPrintPriceList extends Document {
  storeId:     Types.ObjectId;
  name:        string;       // e.g. "ستيكر لصق" / "بانر"
  pricingType: string;       // sqm | meter | piece | sheet | job | design | installation | cutting | lamination
  pricePerUnit: number;      // JOD
  minCharge?:  number;
  notes?:      string;
  active:      boolean;
}
const PrintPriceListSchema = new Schema<IPrintPriceList>({
  storeId:      { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  name:         { type: String, required: true },
  pricingType:  { type: String, default: "sqm" },
  pricePerUnit: { type: Number, required: true },
  minCharge:    { type: Number, default: 0 },
  notes:        { type: String, default: "" },
  active:       { type: Boolean, default: true },
}, { timestamps: true });
export const PrintPriceList = mongoose.model<IPrintPriceList>("PrintPriceList", PrintPriceListSchema);

// ── PrintJob (طلبات الإنتاج) ────────────────────────────────────────────────────
export type PrintJobStatus =
  "new" | "waiting_design" | "design_ready" | "waiting_approval" |
  "approved" | "printing" | "cutting" | "finishing" | "ready" | "delivered" | "cancelled";

export interface IPrintJob extends Document {
  storeId:      Types.ObjectId;
  branchId?:    Types.ObjectId;
  jobNo:        string;
  customer:     string;
  phone?:       string;
  items:        {
    service:    string;
    material?:  string;
    materialId?: Types.ObjectId;
    width:      number;
    height:     number;
    qty:        number;
    area:       number;       // width × height × qty
    pricePerSqm: number;
    subtotal:   number;
    wastePercent: number;
    deductedArea: number;     // area + waste
  }[];
  designFee:    number;
  cuttingFee:   number;
  laminationFee: number;
  installFee:   number;
  discount:     number;
  tax:          number;
  total:        number;
  status:       PrintJobStatus;
  statusHistory: { status: PrintJobStatus; at: Date; by?: string }[];
  deadline?:    Date;
  assignedTo?:  string;
  notes?:       string;
  files:        string[];     // cloud storage URLs
  createdBy?:   Types.ObjectId;
}
const PrintJobSchema = new Schema<IPrintJob>({
  storeId:       { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  branchId:      { type: Schema.Types.ObjectId, ref: "Branch", default: null },
  jobNo:         { type: String, required: true },
  customer:      { type: String, required: true },
  phone:         { type: String, default: "" },
  items:         [{
    service:     String,
    material:    String,
    materialId:  { type: Schema.Types.ObjectId, ref: "PrintMaterial" },
    width:       { type: Number, default: 0 },
    height:      { type: Number, default: 0 },
    qty:         { type: Number, default: 1 },
    area:        { type: Number, default: 0 },
    pricePerSqm: { type: Number, default: 0 },
    subtotal:    { type: Number, default: 0 },
    wastePercent:{ type: Number, default: 0 },
    deductedArea:{ type: Number, default: 0 },
  }],
  designFee:     { type: Number, default: 0 },
  cuttingFee:    { type: Number, default: 0 },
  laminationFee: { type: Number, default: 0 },
  installFee:    { type: Number, default: 0 },
  discount:      { type: Number, default: 0 },
  tax:           { type: Number, default: 0 },
  total:         { type: Number, default: 0 },
  status:        { type: String, default: "new" },
  statusHistory: [{ status: String, at: { type: Date, default: Date.now }, by: String }],
  deadline:      { type: Date },
  assignedTo:    { type: String, default: "" },
  notes:         { type: String, default: "" },
  files:         [String],
  createdBy:     { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
PrintJobSchema.index({ storeId: 1, jobNo: 1 }, { unique: true });
export const PrintJob = mongoose.model<IPrintJob>("PrintJob", PrintJobSchema);

// ── FlowerOrder (طلبات الزهور والتوصيل) ───────────────────────────────────────
export type FlowerOrderStatus = "new" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";

export interface IFlowerOrder extends Document {
  storeId:       Types.ObjectId;
  branchId?:     Types.ObjectId;
  orderNo:       string;
  customer:      string;
  customerPhone: string;
  occasion:      string;
  deliveryType:  "pickup" | "delivery";
  deliveryDate?: Date;
  deliveryTime?: string;
  recipientName?: string;
  recipientPhone?: string;
  deliveryAddress?: string;
  deliveryArea?:   string;
  deliveryFee:   number;
  cardMessage?:  string;
  assignedTo?:   string;
  notes?:        string;
  items: {
    productId?:  Types.ObjectId;
    name:        string;
    qty:         number;
    unitPrice:   number;
    subtotal:    number;
  }[];
  discount:      number;
  tax:           number;
  total:         number;
  status:        FlowerOrderStatus;
  statusHistory: { status: FlowerOrderStatus; at: Date; by?: string }[];
  createdBy?:    Types.ObjectId;
}

const FlowerOrderSchema = new Schema<IFlowerOrder>({
  storeId:        { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  branchId:       { type: Schema.Types.ObjectId, ref: "Branch", default: null },
  orderNo:        { type: String, required: true },
  customer:       { type: String, required: true },
  customerPhone:  { type: String, default: "" },
  occasion:       { type: String, default: "custom" },
  deliveryType:   { type: String, default: "pickup", enum: ["pickup","delivery"] },
  deliveryDate:   { type: Date },
  deliveryTime:   { type: String, default: "" },
  recipientName:  { type: String, default: "" },
  recipientPhone: { type: String, default: "" },
  deliveryAddress:{ type: String, default: "" },
  deliveryArea:   { type: String, default: "" },
  deliveryFee:    { type: Number, default: 0 },
  cardMessage:    { type: String, default: "" },
  assignedTo:     { type: String, default: "" },
  notes:          { type: String, default: "" },
  items: [{
    productId:  { type: Schema.Types.ObjectId, ref: "Product" },
    name:       String,
    qty:        { type: Number, default: 1 },
    unitPrice:  { type: Number, default: 0 },
    subtotal:   { type: Number, default: 0 },
  }],
  discount:      { type: Number, default: 0 },
  tax:           { type: Number, default: 0 },
  total:         { type: Number, default: 0 },
  status:        { type: String, default: "new" },
  statusHistory: [{ status: String, at: { type: Date, default: Date.now }, by: String }],
  createdBy:     { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

FlowerOrderSchema.index({ storeId: 1, orderNo: 1 }, { unique: true });
export const FlowerOrder = mongoose.model<IFlowerOrder>("FlowerOrder", FlowerOrderSchema);
