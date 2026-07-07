import { Router, Response } from "express";
import mongoose, { Schema } from "mongoose";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

let SupplierModel: mongoose.Model<mongoose.Document>;
try { SupplierModel = mongoose.model("Supplier"); }
catch {
  SupplierModel = mongoose.model("Supplier", new Schema({
    storeId:   { type: Schema.Types.ObjectId, required: true, index: true },
    name:      { type: String, required: true },
    phone:     { type: String, default: "" },
    email:     { type: String, default: "" },
    products:  { type: Number, default: 0 },
    balance:   { type: Number, default: 0 },
    lastOrder: { type: String, default: "" },
  }, { timestamps: true }));
}

router.get("/", async (req: AuthRequest, res: Response) => {
  res.json(await SupplierModel.find({ storeId: scopeToStore(req).storeId }));
});
router.post("/", async (req: AuthRequest, res: Response) => {
  res.status(201).json(await SupplierModel.create({ ...req.body, storeId: scopeToStore(req).storeId }));
});
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const s = await SupplierModel.findOneAndUpdate({ _id: req.params["id"], storeId: scopeToStore(req).storeId }, req.body, { new: true });
  res.json(s || { error: "غير موجود" });
});
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  await SupplierModel.findOneAndDelete({ _id: req.params["id"], storeId: scopeToStore(req).storeId });
  res.json({ ok: true });
});

export default router;
