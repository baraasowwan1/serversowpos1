/**
 * Gift Cards Routes — بطاقات الهدايا
 */
import { Router, Response } from "express";
import { GiftCard } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// الحصول على جميع بطاقات الهدايا
router.get("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const cards = await GiftCard.find({ storeId: scope.storeId }).sort({ createdAt: -1 }).limit(200);
  res.json(cards);
});

// إنشاء بطاقة هدية جديدة
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const { balance, notes, expiresAt, createdBy } = req.body;
    if (!balance || balance <= 0) return res.status(400).json({ error: "رصيد البطاقة مطلوب" });
    // توليد كود فريد
    const code = `GC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const card = await GiftCard.create({
      storeId: scope.storeId,
      code, balance, originalBalance: balance,
      isActive: true,
      notes: notes || "",
      createdBy: createdBy || "",
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });
    return res.status(201).json(card);
  } catch (err: unknown) {
    return res.status(500).json({ error: (err as Error).message || "خطأ في إنشاء البطاقة" });
  }
});

// التحقق من رصيد بطاقة هدية (بالكود)
router.get("/check/:code", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const card = await GiftCard.findOne({ storeId: scope.storeId, code: req.params["code"].toUpperCase() });
  if (!card) return res.status(404).json({ error: "الكود غير موجود" });
  if (!card.isActive) return res.status(400).json({ error: "البطاقة غير نشطة أو مستخدمة" });
  if (card.expiresAt && new Date() > card.expiresAt) return res.status(400).json({ error: "انتهت صلاحية البطاقة" });
  return res.json({ code: card.code, balance: card.balance, originalBalance: card.originalBalance, expiresAt: card.expiresAt });
});

// استرداد (استخدام) بطاقة هدية
router.post("/redeem", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const { code, amount, usedBy } = req.body;
    if (!code || !amount || amount <= 0) return res.status(400).json({ error: "بيانات الاسترداد غير صحيحة" });
    const card = await GiftCard.findOne({ storeId: scope.storeId, code: code.toUpperCase() });
    if (!card) return res.status(404).json({ error: "الكود غير موجود" });
    if (!card.isActive) return res.status(400).json({ error: "البطاقة غير نشطة أو مستخدمة مسبقاً" });
    if (card.expiresAt && new Date() > card.expiresAt) return res.status(400).json({ error: "انتهت صلاحية البطاقة" });
    const redeemAmount = Math.min(amount, card.balance);
    const newBalance = card.balance - redeemAmount;
    await GiftCard.findByIdAndUpdate(card._id, {
      balance: newBalance,
      isActive: newBalance > 0,
      usedBy: usedBy || "",
      usedAt: newBalance === 0 ? new Date() : undefined,
    });
    return res.json({ redeemed: redeemAmount, remaining: newBalance, fullyUsed: newBalance === 0 });
  } catch (err: unknown) {
    return res.status(500).json({ error: (err as Error).message || "خطأ في الاسترداد" });
  }
});

// تعطيل بطاقة
router.patch("/:id/deactivate", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const card = await GiftCard.findOneAndUpdate(
    { _id: req.params["id"], storeId: scope.storeId },
    { isActive: false },
    { new: true }
  );
  if (!card) return res.status(404).json({ error: "البطاقة غير موجودة" });
  return res.json(card);
});

// حذف بطاقة
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  await GiftCard.findOneAndDelete({ _id: req.params["id"], storeId: scope.storeId });
  return res.json({ ok: true });
});

export default router;
