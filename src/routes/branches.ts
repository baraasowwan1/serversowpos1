import { Router, Response } from "express";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// Simple in-memory backed by MongoDB — using a generic collection
import mongoose, { Schema } from "mongoose";

let BranchModel: mongoose.Model<any>;
try { BranchModel = mongoose.model("Branch"); }
catch {
  BranchModel = mongoose.model("Branch", new Schema({
    storeId:   { type: Schema.Types.ObjectId, required: true, index: true },
    name:      { type: String, required: true },
    city:      { type: String, default: "" },
    manager:   { type: String, default: "" },
    terminals: { type: Number, default: 0 },
    employees: { type: Number, default: 0 },
    sales:     { type: Number, default: 0 },
    status:    { type: String, default: "نشط" },
  }, { timestamps: true }));
}

let TerminalModel: mongoose.Model<any>;
try { TerminalModel = mongoose.model("Terminal"); }
catch {
  TerminalModel = mongoose.model("Terminal", new Schema({
    storeId:  { type: Schema.Types.ObjectId, required: true, index: true },
    name:     String, cashier: String, branch: String,
    status:   { type: String, default: "مغلق" },
    sales:    { type: Number, default: 0 },
  }, { timestamps: true }));
}

// Branches
router.get("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const branches = await BranchModel.find({ storeId: scope.storeId });
  res.json(branches);
});
router.post("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const b = await BranchModel.create({ ...req.body, storeId: scope.storeId });
  res.status(201).json(b);
});
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const b = await BranchModel.findOneAndUpdate({ _id: req.params["id"], storeId: scope.storeId }, req.body, { new: true });
  res.json(b || { error: "غير موجود" });
});
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  await BranchModel.findOneAndDelete({ _id: req.params["id"], storeId: scope.storeId });
  res.json({ ok: true });
});

// Terminals
router.get("/terminals", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  res.json(await TerminalModel.find({ storeId: scope.storeId }));
});
router.post("/terminals", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  res.status(201).json(await TerminalModel.create({ ...req.body, storeId: scope.storeId }));
});
router.put("/terminals/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const t = await TerminalModel.findOneAndUpdate({ _id: req.params["id"], storeId: scope.storeId }, req.body, { new: true });
  res.json(t || { error: "غير موجود" });
});

export default router;
