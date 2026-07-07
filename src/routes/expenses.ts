import { Router, Response } from "express";
import mongoose from "mongoose";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const Expense = mongoose.model("Expense");

router.get("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const items = await Expense.find({ storeId: scope.storeId }).sort({ createdAt: -1 });
  res.json(items);
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const item = await Expense.create({ ...req.body, storeId: scope.storeId });
  res.status(201).json(item);
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const item = await Expense.findOneAndUpdate({ _id: req.params["id"], storeId: scope.storeId }, req.body, { new: true });
  if (!item) return res.status(404).json({ error: "غير موجود" });
  res.json(item);
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  await Expense.findOneAndDelete({ _id: req.params["id"], storeId: scope.storeId });
  res.json({ ok: true });
});

export default router;
