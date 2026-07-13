import { Router, Response } from "express";
import { Customer } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  res.json(await Customer.find({ storeId: scope.storeId }).sort({ createdAt: -1 }));
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  res.status(201).json(await Customer.create({ ...req.body, storeId: scope.storeId }));
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const id = req.params["id"];
  res.json(await Customer.findOneAndUpdate({ _id: id, storeId: scope.storeId }, req.body, { new: true }));
});

// تحصيل ذمة — خصم مبلغ من دين العميل
router.patch("/:id/collect-debt", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const id = req.params["id"];
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: "المبلغ غير صحيح" });
  const cust = await Customer.findOne({ _id: id, storeId: scope.storeId });
  if (!cust) return res.status(404).json({ error: "العميل غير موجود" });
  const newDebt = Math.max(0, (cust.debt || 0) - amount);
  const updated = await Customer.findOneAndUpdate(
    { _id: id, storeId: scope.storeId },
    { debt: newDebt },
    { new: true }
  );
  return res.json(updated);
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const id = req.params["id"];
  await Customer.findOneAndDelete({ _id: id, storeId: scope.storeId });
  res.json({ ok: true });
});

export default router;
