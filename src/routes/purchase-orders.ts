/**
 * Purchase Orders Routes — طلبات الشراء
 * Draft → Pending → Approved/Rejected → Ordered → Received
 */
import { Router, Response } from "express";
import { PurchaseOrder, Product } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// auto-generate PO number
async function nextPONumber(storeId: string): Promise<string> {
  const count = await PurchaseOrder.countDocuments({ storeId });
  const seq = String(count + 1).padStart(4, "0");
  const y = new Date().getFullYear().toString().slice(-2);
  return `PO${y}-${seq}`;
}

// GET / — list all purchase orders for store
router.get("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const { status, limit: lQ } = req.query as { status?: string; limit?: string };
  const filter: Record<string, unknown> = { storeId: scope.storeId };
  if (status) filter["status"] = status;
  const limit = Math.min(parseInt(lQ || "200"), 500);
  res.json(await PurchaseOrder.find(filter).sort({ createdAt: -1 }).limit(limit).lean());
});

// GET /:id — single PO
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const po = await PurchaseOrder.findOne({ _id: req.params["id"], storeId: scope.storeId }).lean();
  if (!po) return res.status(404).json({ error: "طلب الشراء غير موجود" });
  res.json(po);
});

// POST / — create draft PO
router.post("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const poNumber = await nextPONumber(scope.storeId);
  const body = req.body as Partial<typeof PurchaseOrder.prototype>;
  const po = await PurchaseOrder.create({
    ...body,
    storeId:     scope.storeId,
    poNumber,
    status:      "draft",
    requestedBy: (req as AuthRequest & { user?: { name?: string } }).user?.name || "مستخدم",
  });
  res.status(201).json(po);
});

// PUT /:id — update draft PO
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const po = await PurchaseOrder.findOne({ _id: req.params["id"], storeId: scope.storeId });
  if (!po) return res.status(404).json({ error: "طلب الشراء غير موجود" });
  if (!["draft","pending"].includes(po.status)) return res.status(400).json({ error: "لا يمكن تعديل طلب معتمد أو مستلم" });
  Object.assign(po, req.body);
  await po.save();
  res.json(po);
});

// PATCH /:id/status — approve / reject / mark ordered or received
router.patch("/:id/status", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const { status, note, receivedItems } = req.body as {
    status: string;
    note?: string;
    receivedItems?: { productId: string; qtyReceived: number }[];
  };
  const po = await PurchaseOrder.findOne({ _id: req.params["id"], storeId: scope.storeId });
  if (!po) return res.status(404).json({ error: "طلب الشراء غير موجود" });

  const userName = (req as AuthRequest & { user?: { name?: string } }).user?.name || "مستخدم";

  if (status === "approved") {
    po.status = "approved";
    po.approvedBy = userName;
  } else if (status === "rejected") {
    po.status = "rejected";
    po.rejectedBy = userName;
    po.rejectionNote = note || "";
  } else if (status === "pending") {
    po.status = "pending";
  } else if (status === "ordered") {
    po.status = "ordered";
  } else if (status === "received") {
    po.status = "received";
    po.receivedDate = new Date();
    // Update stock for received items
    if (receivedItems && receivedItems.length > 0) {
      for (const ri of receivedItems) {
        if (ri.productId && ri.qtyReceived > 0) {
          await Product.findOneAndUpdate(
            { _id: ri.productId, storeId: scope.storeId },
            { $inc: { stock: ri.qtyReceived } }
          );
        }
        // mark qty received in PO item
        const item = po.items.find(i => String(i.productId) === ri.productId);
        if (item) item.qtyReceived = ri.qtyReceived;
      }
    } else {
      // receive all items at ordered qty
      for (const item of po.items) {
        if (item.productId && item.qtyOrdered > 0) {
          await Product.findOneAndUpdate(
            { _id: item.productId, storeId: scope.storeId },
            { $inc: { stock: item.qtyOrdered } }
          );
          item.qtyReceived = item.qtyOrdered;
        }
      }
    }
  } else if (status === "cancelled") {
    po.status = "cancelled";
  } else {
    return res.status(400).json({ error: "حالة غير صالحة" });
  }

  await po.save();
  res.json(po);
});

// DELETE /:id — only drafts can be deleted
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const po = await PurchaseOrder.findOne({ _id: req.params["id"], storeId: scope.storeId });
  if (!po) return res.status(404).json({ error: "غير موجود" });
  if (po.status !== "draft") return res.status(400).json({ error: "لا يمكن حذف طلب شراء معتمد" });
  await po.deleteOne();
  res.json({ message: "تم الحذف" });
});

export default router;
