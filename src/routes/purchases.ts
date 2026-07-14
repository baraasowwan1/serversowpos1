import { Router, Response } from "express";
import { Model } from "mongoose";
import mongoose, { Schema } from "mongoose";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";
import { requirePermission, ownerOnly } from "../middleware/roleGuard";

const router = Router();
router.use(authMiddleware);

type AnyMongooseModel = Model<any>;

const purchaseSchema = new Schema({
  storeId: { type: Schema.Types.ObjectId, required: true, index: true },
  sup:     { type: String, default: "" },
  items:   { type: Number, default: 0 },
  total:   { type: Number, default: 0 },
  status:  { type: String, default: "قيد الاستلام" },
}, { timestamps: true });

const PurchaseModel: AnyMongooseModel =
  mongoose.models["Purchase"] || mongoose.model("Purchase", purchaseSchema);

function errRes(res: Response, req: AuthRequest, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, code, message, requestId: req.requestId });
}

router.get("/", requirePermission("purchases:read"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const items = await PurchaseModel.find({ storeId: scope.storeId }).sort({ createdAt: -1 });
    res.json({ success: true, data: items });
  } catch {
    return errRes(res, req, 500, "FETCH_ERROR", "خطأ في جلب المشتريات");
  }
});

router.post("/", requirePermission("purchases:create"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const p = await PurchaseModel.create({ ...req.body, storeId: scope.storeId });
    res.status(201).json({ success: true, data: p });
  } catch {
    return errRes(res, req, 500, "CREATE_ERROR", "خطأ في إضافة الطلبية");
  }
});

router.put("/:id", ownerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const p = await PurchaseModel.findOneAndUpdate(
      { _id: req.params["id"], storeId: scope.storeId },
      req.body,
      { new: true }
    );
    if (!p) return errRes(res, req, 404, "NOT_FOUND", "الطلبية غير موجودة");
    res.json({ success: true, data: p });
  } catch {
    return errRes(res, req, 500, "UPDATE_ERROR", "خطأ في تعديل الطلبية");
  }
});

export default router;
