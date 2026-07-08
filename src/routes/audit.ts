import { Router, Response } from "express";
import mongoose, { Schema, Model } from "mongoose";
import { authMiddleware, superAdminOnly, AuthRequest } from "../middleware/auth";

type AnyMongooseModel = Model<any>;

const auditSchema = new Schema({
  userId:    { type: String, default: "" },
  storeId:   { type: String, default: "", index: true },
  storeName: { type: String, default: "" },
  action:    { type: String, required: true, index: true },
  category:  { type: String, default: "general" }, // login|product|sale|settings|store|subscription|user
  target:    { type: String, default: "" },
  prevValues: mongoose.Schema.Types.Mixed,
  newValues:  mongoose.Schema.Types.Mixed,
  ip:        { type: String, default: "" },
  userAgent: { type: String, default: "" },
  browser:   { type: String, default: "" },
  os:        { type: String, default: "" },
  device:    { type: String, default: "" },
}, { timestamps: true });

export const AuditLog: AnyMongooseModel =
  mongoose.models["AuditLog"] || mongoose.model("AuditLog", auditSchema);

// Helper to log an audit event from any route
export async function logAudit(params: {
  req:       AuthRequest;
  action:    string;
  category?: string;
  target?:   string;
  prevValues?: unknown;
  newValues?:  unknown;
}) {
  try {
    const ua = params.req.headers["user-agent"] || "";
    const ip = (params.req.headers["x-forwarded-for"] as string || params.req.socket?.remoteAddress || "").toString().split(",")[0].trim();
    const browser = ua.includes("Chrome") ? "Chrome" : ua.includes("Firefox") ? "Firefox" : ua.includes("Safari") ? "Safari" : "Other";
    const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" : ua.includes("Android") ? "Android" : ua.includes("iPhone") || ua.includes("iPad") ? "iOS" : ua.includes("Linux") ? "Linux" : "Other";
    const device = ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone") ? "Mobile" : "Desktop";

    await AuditLog.create({
      userId:    params.req.userId   || (params.req.isSuperAdmin ? "super-admin" : ""),
      storeId:   params.req.store?.id   || "",
      storeName: params.req.store?.nameAr || (params.req.isSuperAdmin ? "المدير العام" : ""),
      action:    params.action,
      category:  params.category || "general",
      target:    params.target   || "",
      prevValues: params.prevValues,
      newValues:  params.newValues,
      ip, userAgent: ua, browser, os, device,
    });
  } catch { /* non-blocking */ }
}

const router = Router();
router.use(authMiddleware, superAdminOnly);

// GET /api/audit — paginated, searchable
router.get("/", async (req: AuthRequest, res: Response) => {
  const page     = Math.max(1, parseInt(String(req.query["page"]    || 1)));
  const limit    = Math.min(200, parseInt(String(req.query["limit"] || 50)));
  const search   = String(req.query["search"]   || "");
  const category = String(req.query["category"] || "");
  const storeId  = String(req.query["storeId"]  || "");
  const from     = req.query["from"] ? new Date(String(req.query["from"])) : null;
  const to       = req.query["to"]   ? new Date(String(req.query["to"]))   : null;

  const filter: Record<string, unknown> = {};
  if (search)   filter["$or"] = [{ action: { $regex: search, $options: "i" } }, { storeName: { $regex: search, $options: "i" } }, { target: { $regex: search, $options: "i" } }];
  if (category) filter["category"] = category;
  if (storeId)  filter["storeId"]  = storeId;
  if (from || to) {
    filter["createdAt"] = {};
    if (from) (filter["createdAt"] as Record<string, unknown>)["$gte"] = from;
    if (to)   (filter["createdAt"] as Record<string, unknown>)["$lte"] = to;
  }

  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);

  res.json({ logs, total, page, pages: Math.ceil(total / limit) });
});

// POST /api/audit — frontend logs an event (store or SA)
router.post("/", async (req: AuthRequest, res: Response) => {
  const { action, category, target, prevValues, newValues } = req.body;
  if (!action) return res.status(400).json({ error: "action مطلوب" });
  await logAudit({ req, action, category, target, prevValues, newValues });
  res.status(201).json({ ok: true });
});

// DELETE /api/audit/old — SA can purge logs older than N days
router.delete("/old", async (req: AuthRequest, res: Response) => {
  const days = parseInt(String(req.query["days"] || 90));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
  res.json({ deleted: result.deletedCount });
});

export default router;
