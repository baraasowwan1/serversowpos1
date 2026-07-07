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

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const id = req.params["id"];
  await Customer.findOneAndDelete({ _id: id, storeId: scope.storeId });
  res.json({ ok: true });
});

export default router;
