import { Router, Request, Response } from "express";
import { Plan } from "../models/index";
import { authMiddleware, superAdminOnly, AuthRequest } from "../middleware/auth";

const router = Router();

// Public, read-only plans for the store registration / subscription page.
// Keep this route before the super-admin middleware; plan mutations remain protected.
router.get("/public", async (_req: Request, res: Response) => {
  const plans = await Plan.find({ active: { $ne: false } })
    .select("nameAr price yearlyPrice maxBranches maxUsers maxProducts maxInvoices maxTerminals storage apiAccess badge color features active")
    .sort({ price: 1 })
    .lean();
  res.setHeader("Cache-Control", "no-store");
  res.json(plans);
});

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
