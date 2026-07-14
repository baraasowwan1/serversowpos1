import { Router, Response } from "express";
import { Model } from "mongoose";
import mongoose, { Schema } from "mongoose";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";
import { requirePermission, ownerOnly } from "../middleware/roleGuard";

const router = Router();
router.use(authMiddleware);

type AnyMongooseModel = Model<any>;

const supplierSchema = new Schema({
  storeId:   { type: Schema.Types.ObjectId, required: true, index: true },
  name:      { type: String, required: true },
  phone:     { type: String, default: "" },
  email:     { type: String, default: "" },
  products:  { type: Number, default: 0 },
  balance:   { type: Number, default: 0 },
  lastOrder: { type: String, default: "" },
}, { timestamps: true });

const SupplierModel: AnyMongooseModel =
  mongoose.models["Supplier"] || mongoose.model("Supplier", supplierSchema);

function errRes(res: Response, req: AuthRequest, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, code, message, requestId: req.requestId });
}

router.get("/", requirePermission("products:read"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const items = await SupplierModel.find({ storeId: scope.storeId });
    res.json({ success: true, data: items });
  } catch {
    return errRes(res, req, 500, "FETCH_ERROR", "خطأ في جلب الموردين");
  }
});

router.post("/", ownerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const item = await SupplierModel.create({ ...req.body, storeId: scope.storeId });
    res.status(201).json({ success: true, data: item });
  } catch {
    return errRes(res, req, 500, "CREATE_ERROR", "خطأ في إضافة المورد");
  }
});

router.put("/:id", ownerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const s = await SupplierModel.findOneAndUpdate(
      { _id: req.params["id"], storeId: scope.storeId },
      req.body,
      { new: true }
    );
    if (!s) return errRes(res, req, 404, "NOT_FOUND", "المورد غير موجود");
    res.json({ success: true, data: s });
  } catch {
    return errRes(res, req, 500, "UPDATE_ERROR", "خطأ في تعديل المورد");
  }
});

router.delete("/:id", ownerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    await SupplierModel.findOneAndDelete({ _id: req.params["id"], storeId: scope.storeId });
    res.json({ success: true, message: "تم حذف المورد" });
  } catch {
    return errRes(res, req, 500, "DELETE_ERROR", "خطأ في حذف المورد");
  }
});

export default router;
