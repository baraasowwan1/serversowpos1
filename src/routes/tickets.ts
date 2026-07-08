import { Router, Response } from "express";
import mongoose, { Schema, Model } from "mongoose";
import { authMiddleware, AuthRequest } from "../middleware/auth";

type AnyMongooseModel = Model<any>;

const replySchema = new Schema({
  from:    { type: String, default: "" },
  message: { type: String, required: true },
  isSA:    { type: Boolean, default: false },
}, { timestamps: true });

const ticketSchema = new Schema({
  storeId:   { type: Schema.Types.ObjectId, required: true, index: true },
  storeName: { type: String, default: "" },
  subject:   { type: String, required: true },
  message:   { type: String, default: "" },
  priority:  { type: String, default: "متوسطة" },
  status:    { type: String, default: "open" },
  replies:   [replySchema],
}, { timestamps: true });

const Ticket: AnyMongooseModel =
  mongoose.models["Ticket"] || mongoose.model("Ticket", ticketSchema);

const router = Router();
router.use(authMiddleware);

// GET: SA gets all, store gets own
router.get("/", async (req: AuthRequest, res: Response) => {
  if (req.isSuperAdmin) {
    return res.json(await Ticket.find().sort({ createdAt: -1 }));
  }
  if (!req.store) return res.status(401).json({ error: "غير مصرح" });
  res.json(await Ticket.find({ storeId: req.store.id }).sort({ createdAt: -1 }));
});

// POST: store creates ticket
router.post("/", async (req: AuthRequest, res: Response) => {
  if (!req.store) return res.status(403).json({ error: "مخصص للمتاجر فقط" });
  const { subject, message, priority } = req.body;
  if (!subject) return res.status(400).json({ error: "عنوان التذكرة مطلوب" });
  const t = await Ticket.create({
    storeId:   req.store.id,
    storeName: req.store.nameAr,
    subject, message: message || "", priority: priority || "متوسطة",
  });
  res.status(201).json(t);
});

// POST /:id/reply — SA or store
router.post("/:id/reply", async (req: AuthRequest, res: Response) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "نص الرد مطلوب" });
  const isSA = !!req.isSuperAdmin;
  const from = isSA ? "المدير العام" : req.store?.nameAr || "المتجر";
  const t = await Ticket.findByIdAndUpdate(
    req.params["id"],
    { $push: { replies: { from, message, isSA } }, ...(isSA ? { status: "pending" } : {}) },
    { new: true }
  );
  if (!t) return res.status(404).json({ error: "التذكرة غير موجودة" });
  res.json(t);
});

// PATCH /:id/status — SA only
router.patch("/:id/status", async (req: AuthRequest, res: Response) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: "مخصص للمدير العام" });
  const t = await Ticket.findByIdAndUpdate(req.params["id"], { status: req.body.status }, { new: true });
  res.json(t || { error: "غير موجود" });
});

export default router;
