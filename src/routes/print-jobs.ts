/**
 * Print Jobs Routes — طلبات الإنتاج
 * Handles job lifecycle + automatic material deduction
 */
import { Router, Response } from "express";
import { PrintJob, PrintMaterial, Store } from "../models/index";
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

// Auto-generate job number
async function nextJobNo(storeId: string): Promise<string> {
  const count = await PrintJob.countDocuments({ storeId });
  return `PJ-${String(count + 1).padStart(4, "0")}`;
}

// GET /api/print-jobs
router.get("/", printShopOnly, async (req: AuthRequest, res: Response) => {
  const { status } = req.query;
  const filter: Record<string, unknown> = { storeId: req.store?.id };
  if (status) filter["status"] = status;
  return res.json(await PrintJob.find(filter).sort({ createdAt: -1 }).limit(200));
});

// GET /api/print-jobs/stats
router.get("/stats", printShopOnly, async (req: AuthRequest, res: Response) => {
  const jobs = await PrintJob.find({ storeId: req.store?.id }).lean();
  return res.json({
    total:     jobs.length,
    new:       jobs.filter(j => j.status === "new").length,
    active:    jobs.filter(j => !["delivered","cancelled","new"].includes(j.status)).length,
    ready:     jobs.filter(j => j.status === "ready").length,
    delivered: jobs.filter(j => j.status === "delivered").length,
    cancelled: jobs.filter(j => j.status === "cancelled").length,
    revenue:   jobs.filter(j => j.status === "delivered").reduce((a, j) => a + j.total, 0),
  });
});

// POST /api/print-jobs
router.post("/", printShopOnly, async (req: AuthRequest, res: Response) => {
  const jobNo = await nextJobNo(req.store?.id!);
  const job = await PrintJob.create({
    ...req.body,
    storeId: req.store?.id,
    jobNo,
    status: "new",
    statusHistory: [{ status: "new", at: new Date(), by: req.userId || "النظام" }],
    usedArea: 0,
  });
  return res.status(201).json(job);
});

// PATCH /api/print-jobs/:id/status — change status + deduct material when printing starts
router.patch("/:id/status", printShopOnly, async (req: AuthRequest, res: Response) => {
  const { status, by } = req.body as { status: string; by?: string };
  const job = await PrintJob.findOne({ _id: req.params["id"], storeId: req.store?.id });
  if (!job) return res.status(404).json({ error: "الطلب غير موجود" });

  const prev = job.status;
  job.status = status as typeof job.status;
  job.statusHistory.push({ status: status as typeof job.status, at: new Date(), by: by || "النظام" });

  // Deduct material from inventory when job moves to "printing" (only once)
  if (status === "printing" && prev !== "printing") {
    for (const item of job.items) {
      if (item.materialId && item.deductedArea > 0) {
        await PrintMaterial.findOneAndUpdate(
          { _id: item.materialId, storeId: req.store?.id },
          { $inc: { usedArea: item.deductedArea } }
        ).then(mat => mat?.save()); // trigger pre-save hook for status update
      }
    }
  }

  await job.save();
  return res.json(job);
});

// PUT /api/print-jobs/:id — update job details (only if not delivered/cancelled)
router.put("/:id", printShopOnly, async (req: AuthRequest, res: Response) => {
  const job = await PrintJob.findOne({ _id: req.params["id"], storeId: req.store?.id });
  if (!job) return res.status(404).json({ error: "الطلب غير موجود" });
  if (["delivered", "cancelled"].includes(job.status)) {
    return res.status(400).json({ error: "لا يمكن تعديل طلب مكتمل أو ملغى" });
  }
  Object.assign(job, req.body);
  await job.save();
  return res.json(job);
});

// DELETE /api/print-jobs/:id
router.delete("/:id", printShopOnly, async (req: AuthRequest, res: Response) => {
  const job = await PrintJob.findOne({ _id: req.params["id"], storeId: req.store?.id });
  if (!job) return res.status(404).json({ error: "الطلب غير موجود" });
  if (job.status === "delivered") {
    return res.status(400).json({ error: "لا يمكن حذف طلب تم تسليمه" });
  }
  await job.deleteOne();
  return res.json({ ok: true });
});

export default router;
