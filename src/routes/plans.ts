import { Router, Request, Response } from "express";
import { Plan } from "../models/index";
import { authMiddleware, superAdminOnly, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware, superAdminOnly);

router.get("/", async (_req: Request, res: Response) => {
  res.json(await Plan.find().sort({ price: 1 }));
});

router.post("/", async (req: AuthRequest, res: Response) => {
  res.status(201).json(await Plan.create(req.body));
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params["id"];
  res.json(await Plan.findByIdAndUpdate(id, req.body, { new: true }));
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params["id"];
  await Plan.findByIdAndDelete(id);
  res.json({ ok: true });
});

export default router;
