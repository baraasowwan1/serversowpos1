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

dotenv.config();

const app = express();

// ── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env["FRONTEND_URL"] || "http://localhost:5173",
    "https://pos.sowwanjo.online",
    "http://localhost:5173",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
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
  .then(() => console.log(`✅ MongoDB connected: ${mongoose.connection.name}`))
  .catch(err => { console.error("❌ MongoDB connection failed:", err.message); process.exit(1); });

mongoose.connection.on("disconnected", () => console.log("⚠️  MongoDB disconnected"));
mongoose.connection.on("reconnected", () => console.log("✅ MongoDB reconnected"));

// ── Routes ───────────────────────────────────────────────────────────────────
import authRoutes      from "./routes/auth";
import storeRoutes     from "./routes/stores";
import productRoutes   from "./routes/products";
import saleRoutes      from "./routes/sales";
import customerRoutes  from "./routes/customers";
import inventoryRoutes from "./routes/inventory";
import reportRoutes    from "./routes/reports";
import planRoutes      from "./routes/plans";

app.use("/api/auth",      authRoutes);
app.use("/api/stores",    storeRoutes);
app.use("/api/products",  productRoutes);
app.use("/api/sales",     saleRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/reports",   reportRoutes);
app.use("/api/plans",     planRoutes);

// ── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({
  status: "ok",
  service: "Sowwanjo POS API",
  version: "1.0.0",
  db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  timestamp: new Date().toISOString(),
}));

app.get("/", (_req, res) => res.json({
  name: "Sowwanjo POS API",
  version: "1.0.0",
  domain: "pos.sowwanjo.online",
  status: "running",
}));

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "المسار غير موجود" }));

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "حدث خطأ في الخادم — تحقق من السجلات" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env["PORT"] || "5000");
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Sowwanjo POS API on http://0.0.0.0:${PORT}`);
  console.log(`📊 Environment: ${process.env["NODE_ENV"] || "development"}`);
  console.log(`🌐 CORS allowed: ${process.env["FRONTEND_URL"]}`);
});

export default app;
