/**
 * Sowwanjo POS — Backend API Server
 * نظام نقاط البيع — خادم API الخلفي
 *
 * Stack: Node.js + Express + MongoDB (Mongoose) + TypeScript
 * Deploy: Render.com  |  DB: MongoDB Atlas (sowwanpos cluster)
 */
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { runMigrations } from "./migrations/runner";
import { requestIdMiddleware } from "./middleware/requestId";

dotenv.config();

const app = express();

// ── Request ID — first middleware so every request gets a traceable ID ────────
app.use(requestIdMiddleware);

// ── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
const corsOptions = {
  origin: true, // reflect request origin — JWT is the security gate
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.options("*", cors(corsOptions)); // explicit preflight handler for all routes
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(morgan(process.env["NODE_ENV"] === "production" ? "combined" : "dev"));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, message: { error: "طلبات كثيرة جداً، حاول بعد 15 دقيقة" } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "محاولات دخول كثيرة جداً" } });
app.use("/api/", apiLimiter);
app.use("/api/auth/", authLimiter);

// ── MongoDB Connection ────────────────────────────────────────────────────────
const MONGODB_URI = process.env["MONGODB_URI"];
if (!MONGODB_URI) { console.error("❌ MONGODB_URI is not set"); process.exit(1); }

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log(`✅ MongoDB connected: ${mongoose.connection.name}`);
    await runMigrations();
  })
  .catch(err => { console.error("❌ MongoDB connection failed:", err.message); process.exit(1); });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(mongoose.connection as any).on("disconnected", () => console.log("⚠️  MongoDB disconnected"));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(mongoose.connection as any).on("reconnected", () => console.log("✅ MongoDB reconnected"));

// ── Routes ───────────────────────────────────────────────────────────────────
import authRoutes      from "./routes/auth";
import storeRoutes     from "./routes/stores";
import productRoutes   from "./routes/products";
import saleRoutes      from "./routes/sales";
import customerRoutes  from "./routes/customers";
import inventoryRoutes from "./routes/inventory";
import reportRoutes    from "./routes/reports";
import planRoutes      from "./routes/plans";
import expenseRoutes   from "./routes/expenses";
import branchRoutes    from "./routes/branches";
import userRoutes      from "./routes/users";
import settingsRoutes  from "./routes/settings";
import supplierRoutes  from "./routes/suppliers";
import purchaseRoutes  from "./routes/purchases";
import returnRoutes        from "./routes/returns";
import announcementRoutes  from "./routes/announcements";
import printMaterialRoutes from "./routes/print-materials";
import flowerOrderRoutes   from "./routes/flower-orders";
import printJobRoutes      from "./routes/print-jobs";
import printPriceRoutes    from "./routes/print-price-lists";
import ticketRoutes        from "./routes/tickets";
import saSettingsRoutes, { brandingPublicRouter } from "./routes/sa-settings";
import auditRoutes         from "./routes/audit";
import syncRoutes          from "./routes/sync";
import couponRoutes        from "./routes/coupons";
import saStatsRoutes       from "./routes/sa-stats";
import masterCatalogRoutes from "./routes/master-catalog";
import purchaseOrderRoutes from "./routes/purchase-orders";
import promotionRoutes     from "./routes/promotions";
import giftCardRoutes      from "./routes/gift-cards";
import subscriptionRequestRoutes from "./routes/subscription-requests";

app.use("/api/auth",                   authRoutes);
app.use("/api/stores",                 storeRoutes);
app.use("/api/super-admin/stores",     storeRoutes);
app.use("/api/products",               productRoutes);
app.use("/api/sales",                  saleRoutes);
app.use("/api/customers",              customerRoutes);
app.use("/api/inventory",              inventoryRoutes);
app.use("/api/reports",                reportRoutes);
app.use("/api/plans",                  planRoutes);
app.use("/api/expenses",               expenseRoutes);
app.use("/api/branches",               branchRoutes);
app.use("/api/users",                  userRoutes);
app.use("/api/settings",              settingsRoutes);
app.use("/api/suppliers",              supplierRoutes);
app.use("/api/purchases",              purchaseRoutes);
app.use("/api/returns",                returnRoutes);
app.use("/api/announcements",          announcementRoutes);
app.use("/api/tickets",                ticketRoutes);
app.use("/api/super-admin/settings",   saSettingsRoutes);
app.use("/api/branding",               brandingPublicRouter); // public — no auth
app.use("/api/audit",                  auditRoutes);
app.use("/api/print-materials",        printMaterialRoutes);
app.use("/api/print-jobs",             printJobRoutes);
app.use("/api/print-price-lists",      printPriceRoutes);
app.use("/api/flower-orders",          flowerOrderRoutes);
app.use("/api/sync",                   syncRoutes);
app.use("/api/coupons",                couponRoutes);
app.use("/api/super-admin/stats",      saStatsRoutes);
app.use("/api/master-catalog",         masterCatalogRoutes);
app.use("/api/purchase-orders",        purchaseOrderRoutes);
app.use("/api/promotions",             promotionRoutes);
app.use("/api/gift-cards",             giftCardRoutes);

// ── Health Check ─────────────────────────────────────────────────────────────
const APP_VERSION = process.env["APP_VERSION"] || "1.0.0";
app.get("/health", (_req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? "connected" : dbState === 2 ? "connecting" : "disconnected";
  res.json({
    success: true,
    status: dbState === 1 ? "ok" : "degraded",
    service: "Sowwanjo POS API",
    version: APP_VERSION,
    db: dbStatus,
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage().heapUsed,
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (_req, res) => res.json({
  name: "Sowwanjo POS API",
  version: APP_VERSION,
  domain: "pos.sowwanjo.online",
  status: "running",
}));

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req: express.Request, res: express.Response) => res.status(404).json({
  success: false,
  code: "NOT_FOUND",
  message: "المسار غير موجود",
  path: req.path,
  requestId: (req as express.Request & { requestId?: string }).requestId,
}));

// ── Global Error Handler ───────────────────────────────────────────────────────
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const reqId = (req as express.Request & { requestId?: string }).requestId;
  // Log full error server-side but never expose stack trace to client
  console.error(`[ERROR] requestId=${reqId} path=${req.path} method=${req.method}`, err.stack || err.message);
  res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: "حدث خطأ في الخادم — يرجى المحاولة مرة أخرى",
    requestId: reqId,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env["PORT"] || "5000");
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Sowwanjo POS API on http://0.0.0.0:${PORT}`);
  console.log(`📊 Environment: ${process.env["NODE_ENV"] || "development"}`);
  console.log(`🌐 CORS allowed: ${process.env["FRONTEND_URL"]}`);
});

export default app;
