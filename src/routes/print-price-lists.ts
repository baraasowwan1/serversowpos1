/**
 * Print Price Lists Routes — قوائم أسعار الطباعة
 */
import { Router, Response } from "express";
import { PrintPriceList, Store } from "../models/index";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

async function printShopOnly(req: AuthRequest, res: Response, next: () => void) {
  const store = await Store.findById(req.store?.id).select("category").lean();
  if (!store || store.category !== "print_shop") {
    return res.status(403).json({ error: "هذه الميزة متاحة فقط لمتاجر الطباعة" });
  }
  return next();
}

router.get("/", printShopOnly, async (req: AuthRequest, res: Response) => {
  return res.json(await PrintPriceList.find({ storeId: req.store?.id }).sort({ name: 1 }));
});

router.post("/", printShopOnly, async (req: AuthRequest, res: Response) => {
  const item = await PrintPriceList.create({ ...req.body, storeId: req.store?.id });
  return res.status(201).json(item);
});

router.put("/:id", printShopOnly, async (req: AuthRequest, res: Response) => {
  const item = await PrintPriceList.findOneAndUpdate(
    { _id: req.params["id"], storeId: req.store?.id },
    req.body,
    { new: true }
  );
  if (!item) return res.status(404).json({ error: "السعر غير موجود" });
  return res.json(item);
});

router.delete("/:id", printShopOnly, async (req: AuthRequest, res: Response) => {
  await PrintPriceList.findOneAndDelete({ _id: req.params["id"], storeId: req.store?.id });
  return res.json({ ok: true });
});

export default router;
