import { Router, Response } from "express";
import mongoose, { Schema } from "mongoose";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

let PurchaseModel: mongoose.Model<any>;
try { PurchaseModel = mongoose.model("Purchase"); }
catch {
  PurchaseModel = mongoose.model("Purchase", new Schema({
    storeId: { type: Schema.Types.ObjectId, required: true, index: true },
    sup:     String, items: Number, total: Number,
    status:  { type: String, default: "قيد الاستلام" },
  }, { timestamps: true }));
}

router.get("/", async (req: AuthRequest, res: Response) => {
  res.json(await PurchaseModel.find({ storeId: scopeToStore(req).storeId }).sort({ createdAt: -1 }));
});
router.post("/", async (req: AuthRequest, res: Response) => {
  res.status(201).json(await PurchaseModel.create({ ...req.body, storeId: scopeToStore(req).storeId }));
});
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const p = await PurchaseModel.findOneAndUpdate({ _id: req.params["id"], storeId: scopeToStore(req).storeId }, req.body, { new: true });
  res.json(p || { error: "غير موجود" });
});

export default router;
