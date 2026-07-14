import { Router, Response } from "express";
import mongoose, { Schema, Model } from "mongoose";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

type AnyMongooseModel = Model<any>;

const couponSchema = new Schema({
  storeId:   { type: String, required: true, index: true },
  code:      { type: String, required: true },
  desc:      { type: String, default: "" },
  type:      { type: String, enum: ["نسبة", "مبلغ"], default: "نسبة" },
  value:     { type: Number, required: true },
  uses:      { type: Number, default: 0 },
  maxUses:   { type: Number, default: 0 },   // 0 = unlimited
  exp:       { type: String, default: "" },   // ISO date string or ""
  active:    { type: Boolean, default: true },
}, { timestamps: true });

couponSchema.index({ storeId: 1, code: 1 }, { unique: true });

const Coupon: AnyMongooseModel =
  mongoose.models["Coupon"] || mongoose.model("Coupon", couponSchema);

const router = Router();
router.use(authMiddleware);

// GET /api/coupons
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const coupons = await Coupon.find({ storeId: scope.storeId }).sort({ createdAt: -1 });
    res.json(coupons);
  } catch (e) { res.status(500).json({ error: "فشل جلب القسائم" }); }
});

// POST /api/coupons
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const { code, desc, type, value, maxUses, exp } = req.body as Record<string, string | number>;
    if (!code || !value) return res.status(400).json({ error: "الكود والقيمة مطلوبان" });
    const existing = await Coupon.findOne({ storeId: scope.storeId, code: String(code).toUpperCase() });
    if (existing) return res.status(409).json({ error: "هذا الكود موجود مسبقاً" });
    const c = await Coupon.create({
      storeId: scope.storeId,
      code: String(code).toUpperCase(),
      desc, type, value: Number(value),
      maxUses: Number(maxUses || 0),
      exp: exp || "",
    });
    res.status(201).json(c);
  } catch (e) { res.status(500).json({ error: "فشل إنشاء القسيمة" }); }
});

// PATCH /api/coupons/:id/use  — increment use counter
router.patch("/:id/use", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const c = await Coupon.findOneAndUpdate(
      { _id: req.params["id"], storeId: scope.storeId },
      { $inc: { uses: 1 } },
      { new: true }
    );
    if (!c) return res.status(404).json({ error: "القسيمة غير موجودة" });
    res.json(c);
  } catch { res.status(500).json({ error: "فشل تحديث الاستخدام" }); }
});

// PUT /api/coupons/:id
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const c = await Coupon.findOneAndUpdate(
      { _id: req.params["id"], storeId: scope.storeId },
      { $set: req.body },
      { new: true }
    );
    if (!c) return res.status(404).json({ error: "القسيمة غير موجودة" });
    res.json(c);
  } catch { res.status(500).json({ error: "فشل التعديل" }); }
});

// GET /api/coupons/check/:code — validate a coupon code (used at POS)
router.get("/check/:code", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const c = await Coupon.findOne({ storeId: scope.storeId, code: req.params["code"].toUpperCase() });
    if (!c) return res.status(404).json({ error: "كود الكوبون غير موجود" });
    if (!c.active) return res.status(400).json({ error: "هذا الكوبون غير نشط" });
    if (c.maxUses > 0 && c.uses >= c.maxUses) return res.status(400).json({ error: "تجاوز الكوبون الحد الأقصى للاستخدام" });
    if (c.exp && new Date() > new Date(c.exp)) return res.status(400).json({ error: "انتهت صلاحية الكوبون" });
    return res.json({ id: c._id, code: c.code, type: c.type, value: c.value, desc: c.desc });
  } catch { res.status(500).json({ error: "فشل التحقق من الكوبون" }); }
});

// DELETE /api/coupons/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    await Coupon.findOneAndDelete({ _id: req.params["id"], storeId: scope.storeId });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "فشل الحذف" }); }
});

export default router;
