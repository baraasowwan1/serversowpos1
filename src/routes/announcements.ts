import { Router, Response } from "express";
import mongoose, { Schema, Model } from "mongoose";
import { authMiddleware, superAdminOnly, AuthRequest } from "../middleware/auth";

type AnyMongooseModel = Model<any>;

const announcementSchema = new Schema({
  title:   { type: String, default: "إعلان جديد" },
  message: { type: String, required: true },
  target:  { type: String, default: "all" }, // "all" | "active" | storeId
  type:    { type: String, default: "info" },
}, { timestamps: true });

const Ann: AnyMongooseModel =
  mongoose.models["Announcement"] || mongoose.model("Announcement", announcementSchema);

const router = Router();
router.use(authMiddleware);

// SA: get all
router.get("/", superAdminOnly, async (_req: AuthRequest, res: Response) => {
  res.json(await Ann.find().sort({ createdAt: -1 }).limit(100));
});

// SA: create
router.post("/", superAdminOnly, async (req: AuthRequest, res: Response) => {
  const { title, message, target, type } = req.body;
  if (!message) return res.status(400).json({ error: "نص الإعلان مطلوب" });
  const doc = await Ann.create({ title: title || "إعلان جديد", message, target: target || "all", type: type || "info" });
  res.status(201).json(doc);
});

// SA: delete
router.delete("/:id", superAdminOnly, async (req: AuthRequest, res: Response) => {
  await Ann.findByIdAndDelete(req.params["id"]);
  res.json({ ok: true });
});

// Store: get announcements targeted to me
router.get("/for-store", async (req: AuthRequest, res: Response) => {
  const storeId = req.store?.id;
  const docs = await Ann.find({
    $or: [{ target: "all" }, { target: "active" }, { target: storeId }],
  }).sort({ createdAt: -1 }).limit(30);
  res.json(docs);
});

export default router;
