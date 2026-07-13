/**
 * Promotions Routes — العروض والخصومات
 */
import { Router, Response } from "express";
import { Promotion } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// GET / — list active promotions (or all)
router.get("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const { active } = req.query as { active?: string };
  const filter: Record<string, unknown> = { storeId: scope.storeId };
  if (active === "true") {
    const now = new Date();
    filter["active"] = true;
    filter["startDate"] = { $lte: now };
    filter["endDate"]   = { $gte: now };
  }
  res.json(await Promotion.find(filter).sort({ createdAt: -1 }).lean());
});

// POST / — create promotion
router.post("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const userName = (req as AuthRequest & { user?: { name?: string } }).user?.name || "مستخدم";
  const promo = await Promotion.create({ ...req.body, storeId: scope.storeId, createdBy: userName });
  res.status(201).json(promo);
});

// PUT /:id — update promotion
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const promo = await Promotion.findOneAndUpdate(
    { _id: req.params["id"], storeId: scope.storeId },
    req.body,
    { new: true }
  );
  if (!promo) return res.status(404).json({ error: "العرض غير موجود" });
  res.json(promo);
});

// DELETE /:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  await Promotion.findOneAndDelete({ _id: req.params["id"], storeId: scope.storeId });
  res.json({ message: "تم حذف العرض" });
});

export default router;
