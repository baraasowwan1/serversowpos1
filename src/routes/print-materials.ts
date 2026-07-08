/**
 * Print Materials Routes — مواد الطباعة
 * Only accessible by print_shop stores (enforced by printShopOnly middleware)
 */
import { Router, Response } from "express";
import { PrintMaterial, Store } from "../models/index";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// Guard: reject non-print_shop stores
async function printShopOnly(req: AuthRequest, res: Response, next: () => void) {
  const store = await Store.findById(req.store?.id).select("category").lean();
  if (!store || store.category !== "print_shop") {
    return res.status(403).json({ error: "هذه الميزة متاحة فقط لمتاجر الطباعة" });
  }
  return next();
}

// GET /api/print-materials
router.get("/", printShopOnly, async (req: AuthRequest, res: Response) => {
  const materials = await PrintMaterial.find({ storeId: req.store?.id }).sort({ createdAt: -1 });
  return res.json(materials);
});

// POST /api/print-materials
router.post("/", printShopOnly, async (req: AuthRequest, res: Response) => {
  const mat = await PrintMaterial.create({ ...req.body, storeId: req.store?.id, usedArea: 0 });
  return res.status(201).json(mat);
});

// PUT /api/print-materials/:id
router.put("/:id", printShopOnly, async (req: AuthRequest, res: Response) => {
  const mat = await PrintMaterial.findOneAndUpdate(
    { _id: req.params["id"], storeId: req.store?.id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!mat) return res.status(404).json({ error: "المادة غير موجودة" });
  return res.json(mat);
});

// PATCH /api/print-materials/:id/deduct — deduct area after job
router.patch("/:id/deduct", printShopOnly, async (req: AuthRequest, res: Response) => {
  const { area } = req.body as { area: number };
  if (!area || area <= 0) return res.status(400).json({ error: "المساحة المطلوبة غير صالحة" });
  const mat = await PrintMaterial.findOne({ _id: req.params["id"], storeId: req.store?.id });
  if (!mat) return res.status(404).json({ error: "المادة غير موجودة" });
  mat.usedArea += area;
  await mat.save(); // pre-save hook updates status
  return res.json(mat);
});

// DELETE /api/print-materials/:id
router.delete("/:id", printShopOnly, async (req: AuthRequest, res: Response) => {
  await PrintMaterial.findOneAndDelete({ _id: req.params["id"], storeId: req.store?.id });
  return res.json({ ok: true });
});

export default router;
