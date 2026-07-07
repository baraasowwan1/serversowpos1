import { Router, Response } from "express";
import { Model } from "mongoose";
import mongoose, { Schema } from "mongoose";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

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

router.get("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  res.json(await SupplierModel.find({ storeId: scope.storeId }));
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  res.status(201).json(await SupplierModel.create({ ...req.body, storeId: scope.storeId }));
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const s = await SupplierModel.findOneAndUpdate(
    { _id: req.params["id"], storeId: scope.storeId },
    req.body,
    { new: true }
  );
  res.json(s || { error: "غير موجود" });
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  await SupplierModel.findOneAndDelete({ _id: req.params["id"], storeId: scope.storeId });
  res.json({ ok: true });
});

export default router;
