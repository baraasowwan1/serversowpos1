/**
 * Flower Orders Routes — طلبات الزهور والتوصيل
 * Only accessible by flower_shop stores
 */
import { Router, Response } from "express";
import { FlowerOrder, Store, Product } from "../models/index";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

async function flowerShopOnly(req: AuthRequest, res: Response, next: () => void) {
  const store = await Store.findById(req.store?.id).select("category").lean();
  if (!store || store.category !== "flower_shop") {
    return res.status(403).json({ error: "هذه الميزة متاحة فقط لمتاجر الزهور" });
  }
  return next();
}

async function nextOrderNo(storeId: string): Promise<string> {
  const count = await FlowerOrder.countDocuments({ storeId });
  return `FO-${String(count + 1).padStart(4, "0")}`;
}

// GET /api/flower-orders
router.get("/", flowerShopOnly, async (req: AuthRequest, res: Response) => {
  const { status } = req.query;
  const filter: Record<string, unknown> = { storeId: req.store?.id };
  if (status) filter["status"] = status;
  return res.json(await FlowerOrder.find(filter).sort({ createdAt: -1 }).limit(300));
});

// GET /api/flower-orders/stats
router.get("/stats", flowerShopOnly, async (req: AuthRequest, res: Response) => {
  const orders = await FlowerOrder.find({ storeId: req.store?.id }).lean();
  return res.json({
    total:     orders.length,
    new:       orders.filter(o => o.status === "new").length,
    preparing: orders.filter(o => o.status === "preparing").length,
    ready:     orders.filter(o => o.status === "ready").length,
    delivered: orders.filter(o => o.status === "delivered").length,
    cancelled: orders.filter(o => o.status === "cancelled").length,
    revenue:   orders.filter(o => o.status === "delivered").reduce((a, o) => a + o.total, 0),
    deliveries: orders.filter(o => o.deliveryType === "delivery").length,
  });
});

// POST /api/flower-orders — create order + deduct product stock
router.post("/", flowerShopOnly, async (req: AuthRequest, res: Response) => {
  const orderNo = await nextOrderNo(req.store?.id!);
  const { items = [], ...rest } = req.body;

  // Deduct inventory for each item that has a productId
  for (const item of items as { productId?: string; qty: number }[]) {
    if (item.productId && item.qty > 0) {
      await Product.findOneAndUpdate(
        { _id: item.productId, storeId: req.store?.id },
        { $inc: { stock: -item.qty } }
      );
    }
  }

  const order = await FlowerOrder.create({
    ...rest,
    items,
    storeId: req.store?.id,
    orderNo,
    status: "new",
    statusHistory: [{ status: "new", at: new Date(), by: req.userId || "النظام" }],
  });
  return res.status(201).json(order);
});

// PATCH /api/flower-orders/:id/status
router.patch("/:id/status", flowerShopOnly, async (req: AuthRequest, res: Response) => {
  const { status, by } = req.body as { status: string; by?: string };
  const order = await FlowerOrder.findOne({ _id: req.params["id"], storeId: req.store?.id });
  if (!order) return res.status(404).json({ error: "الطلب غير موجود" });
  order.status = status as typeof order.status;
  order.statusHistory.push({ status: status as typeof order.status, at: new Date(), by: by || "النظام" });
  await order.save();
  return res.json(order);
});

// PUT /api/flower-orders/:id
router.put("/:id", flowerShopOnly, async (req: AuthRequest, res: Response) => {
  const order = await FlowerOrder.findOne({ _id: req.params["id"], storeId: req.store?.id });
  if (!order) return res.status(404).json({ error: "الطلب غير موجود" });
  if (["delivered", "cancelled"].includes(order.status)) {
    return res.status(400).json({ error: "لا يمكن تعديل طلب مكتمل أو ملغى" });
  }
  Object.assign(order, req.body);
  await order.save();
  return res.json(order);
});

// DELETE /api/flower-orders/:id
router.delete("/:id", flowerShopOnly, async (req: AuthRequest, res: Response) => {
  const order = await FlowerOrder.findOne({ _id: req.params["id"], storeId: req.store?.id });
  if (!order) return res.status(404).json({ error: "الطلب غير موجود" });
  if (order.status === "delivered") {
    return res.status(400).json({ error: "لا يمكن حذف طلب تم تسليمه" });
  }
  await order.deleteOne();
  return res.json({ ok: true });
});

export default router;
