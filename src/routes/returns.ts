import { Router, Response } from "express";
import mongoose, { Schema } from "mongoose";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

let ReturnModel: mongoose.Model<any>;
try { ReturnModel = mongoose.model("Return"); }
catch {
  ReturnModel = mongoose.model("Return", new Schema({
    storeId: { type: Schema.Types.ObjectId, required: true, index: true },
    inv: String, cust: String, amount: Number,
    reason: String, status: { type: String, default: "قيد المراجعة" },
  }, { timestamps: true }));
}

router.get("/", async (req: AuthRequest, res: Response) => {
  res.json(await ReturnModel.find({ storeId: scopeToStore(req).storeId }).sort({ createdAt: -1 }));
});
router.post("/", async (req: AuthRequest, res: Response) => {
  res.status(201).json(await ReturnModel.create({ ...req.body, storeId: scopeToStore(req).storeId }));
});
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const r = await ReturnModel.findOneAndUpdate({ _id: req.params["id"], storeId: scopeToStore(req).storeId }, req.body, { new: true });
  res.json(r || { error: "غير موجود" });
});

export default router;
