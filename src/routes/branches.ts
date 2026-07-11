import { Router, Response } from "express";
import { Model } from "mongoose";
import mongoose, { Schema } from "mongoose";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

type AnyMongooseModel = Model<any>;

// ── Branch Model ──────────────────────────────────────────────────────────────
const branchSchema = new Schema({
  storeId:   { type: Schema.Types.ObjectId, required: true, index: true },
  name:      { type: String, required: true },
  city:      { type: String, default: "" },
  manager:   { type: String, default: "" },
  terminals: { type: Number, default: 0 },
  employees: { type: Number, default: 0 },
  sales:     { type: Number, default: 0 },
  status:    { type: String, default: "نشط" },
}, { timestamps: true });

const BranchModel: AnyMongooseModel =
  mongoose.models["Branch"] || mongoose.model("Branch", branchSchema);

// ── Terminal Model ────────────────────────────────────────────────────────────
const terminalSchema = new Schema({
  storeId:  { type: Schema.Types.ObjectId, required: true, index: true },
  name:     { type: String, default: "" },
  cashier:  { type: String, default: "" },
  branch:   { type: String, default: "" },
  status:   { type: String, default: "مغلق" },
  sales:    { type: Number, default: 0 },
}, { timestamps: true });

const TerminalModel: AnyMongooseModel =
  mongoose.models["Terminal"] || mongoose.model("Terminal", terminalSchema);

// ── Branch Routes ─────────────────────────────────────────────────────────────
router.get("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  res.json(await BranchModel.find({ storeId: scope.storeId }));
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const b = await BranchModel.create({ ...req.body, storeId: scope.storeId });
    return res.status(201).json(b);
  } catch (err: unknown) {
    return res.status(500).json({ error: (err as Error).message || "خطأ في إنشاء الفرع" });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const b = await BranchModel.findOneAndUpdate(
    { _id: req.params["id"], storeId: scope.storeId },
    req.body,
    { new: true }
  );
  res.json(b || { error: "غير موجود" });
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  await BranchModel.findOneAndDelete({ _id: req.params["id"], storeId: scope.storeId });
  res.json({ ok: true });
});

// ── Terminal Routes ───────────────────────────────────────────────────────────
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
  const t = await TerminalModel.findOneAndUpdate(
    { _id: req.params["id"], storeId: scope.storeId },
    req.body,
    { new: true }
  );
  res.json(t || { error: "غير موجود" });
});

export default router;
