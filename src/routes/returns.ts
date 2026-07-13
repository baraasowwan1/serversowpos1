/**
 * Returns Routes — المرتجعات (محدّث لتعديل المخزون تلقائياً)
 */
import { Router, Response } from "express";
import mongoose, { Schema, Model } from "mongoose";
import { Product, Sale } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

type AnyModel = Model<any>;

const returnSchema = new Schema({
  storeId:      { type: Schema.Types.ObjectId, required: true, index: true },
  inv:          { type: String, default: "" },   // invoice number
  saleId:       { type: Schema.Types.ObjectId, ref: "Sale" },
  cust:         { type: String, default: "" },
  amount:       { type: Number, default: 0 },
  reason:       { type: String, default: "" },
  status:       { type: String, default: "قيد المراجعة" },
  processedBy:  { type: String, default: "" },
  items: [{
    productId:  { type: Schema.Types.ObjectId, ref: "Product" },
    nameAr:     String,
    qty:        { type: Number, default: 1 },
    unitPrice:  { type: Number, default: 0 },
    total:      { type: Number, default: 0 },
  }],
  stockRestored: { type: Boolean, default: false },
}, { timestamps: true });

const ReturnModel: AnyModel =
  mongoose.models["Return"] || mongoose.model("Return", returnSchema);

router.get("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  res.json(await ReturnModel.find({ storeId: scope.storeId }).sort({ createdAt: -1 }));
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const body = req.body as {
    inv?: string; saleId?: string; cust?: string; amount?: number;
    reason?: string; items?: { productId: string; qty: number }[];
    restoreStock?: boolean;
  };

  const ret = await ReturnModel.create({ ...body, storeId: scope.storeId, stockRestored: false });

  // Restore stock if requested and items provided
  if (body.restoreStock !== false && body.items && body.items.length > 0) {
    for (const item of body.items) {
      if (item.productId && item.qty > 0) {
        await Product.findOneAndUpdate(
          { _id: item.productId, storeId: scope.storeId },
          { $inc: { stock: item.qty } }
        );
      }
    }
    ret.stockRestored = true;
    await ret.save();

    // Mark the original sale as refunded if saleId provided
    if (body.saleId) {
      await Sale.findOneAndUpdate(
        { _id: body.saleId, storeId: scope.storeId },
        { status: "refunded" }
      );
    }
  }

  res.status(201).json(ret);
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const r = await ReturnModel.findOneAndUpdate(
    { _id: req.params["id"], storeId: scope.storeId },
    req.body,
    { new: true }
  );
  res.json(r || { error: "غير موجود" });
});

export default router;
