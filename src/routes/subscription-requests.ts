/** Subscription renewal requests — persisted in MongoDB for the super-admin inbox. */
import { Router, Response } from "express";
import mongoose, { Schema } from "mongoose";
import { Store } from "../models/index";
import { authMiddleware, superAdminOnly, AuthRequest } from "../middleware/auth";

const router = Router();
const RequestSchema = new Schema({
  storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
  storeName: { type: String, required: true },
  requesterId: { type: String, default: "" },
  requesterRole: { type: String, default: "" },
  requesterEmail: { type: String, default: "" },
  requestType: { type: String, enum: ["renewal", "upgrade"], default: "renewal" },
  requestedPlan: { type: String, default: "" },
  message: { type: String, default: "" },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
}, { timestamps: true });
RequestSchema.index({ storeId: 1, status: 1 });
const SubscriptionRequest = mongoose.models["SubscriptionRequest"] ||
  mongoose.model("SubscriptionRequest", RequestSchema);

// Store owner/merchant: submit a renewal or upgrade request (allowed even after expiry).
router.post("/request", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.store?.id) return res.status(401).json({ error: "تعذر تحديد المتجر المرتبط بالحساب" });
    const store = await Store.findById(req.store.id).select("nameAr email plan");
    if (!store) return res.status(404).json({ error: "المتجر غير موجود" });
    const body = req.body as { requestType?: string; requestedPlan?: string; message?: string };
    const requestType = body.requestType === "upgrade" ? "upgrade" : "renewal";
    const pending = await SubscriptionRequest.findOne({ storeId: store._id, status: "pending" });
    if (pending) return res.json({ ok: true, existing: true, message: "لدى متجرك طلب تجديد/ترقية قيد المراجعة بالفعل" });
    const created = await SubscriptionRequest.create({
      storeId: store._id,
      storeName: store.nameAr,
      requesterId: req.userId || "",
      requesterRole: req.userRole || "",
      requesterEmail: store.email || "",
      requestType,
      requestedPlan: typeof body.requestedPlan === "string" ? body.requestedPlan.slice(0, 100) : "",
      message: typeof body.message === "string" ? body.message.slice(0, 1000) : "",
    });
    return res.status(201).json({ ok: true, request: { id: created._id, storeName: created.storeName, status: created.status } });
  } catch (err) {
    console.error("Subscription request error:", err);
    return res.status(500).json({ error: "تعذر إرسال طلب التجديد الآن" });
  }
});

// Super-admin inbox for renewal/upgrade requests.
router.get("/", authMiddleware, superAdminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const requests = await SubscriptionRequest.find().sort({ status: 1, createdAt: -1 }).limit(100).lean();
    return res.json(requests.map((r: Record<string, unknown> & { _id: unknown }) => ({ ...r, id: String(r._id) })));
  } catch (err) {
    console.error("Subscription request list error:", err);
    return res.status(500).json({ error: "تعذر جلب طلبات التجديد" });
  }
});

router.patch("/:id", authMiddleware, superAdminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body as { status?: string };
    if (status !== "approved" && status !== "rejected") {
      return res.status(400).json({ error: "الحالة المطلوبة غير صالحة" });
    }
    const updated = await SubscriptionRequest.findByIdAndUpdate(req.params["id"], { status }, { new: true });
    if (!updated) return res.status(404).json({ error: "طلب التجديد غير موجود" });
    return res.json({ ok: true, id: String(updated._id), status: updated.status });
  } catch {
    return res.status(500).json({ error: "تعذر تحديث طلب التجديد" });
  }
});

export default router;
