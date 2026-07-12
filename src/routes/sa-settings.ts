import { Router, Request, Response } from "express";
import mongoose, { Schema, Model } from "mongoose";
import { authMiddleware, superAdminOnly } from "../middleware/auth";

type AnyMongooseModel = Model<any>;

const sysSchema = new Schema({
  key:   { type: String, unique: true, required: true },
  value: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const SysSett: AnyMongooseModel =
  mongoose.models["SystemSetting"] || mongoose.model("SystemSetting", sysSchema);

// Public safe branding fields (no auth required)
const PUBLIC_BRANDING_KEYS = [
  "platformName","platformShortName","logoUrl","iconUrl",
  "primaryColor","secondaryColor","accentColor","sidebarStyle",
  "loginTitle","loginSubtitle","supportEmail","supportPhone",
  "websiteUrl","footerCopyright",
];

const publicRouter = Router();
publicRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const settings = await SysSett.find({ key: { $in: PUBLIC_BRANDING_KEYS } });
    const obj: Record<string, unknown> = {};
    settings.forEach((s: { key: string; value: unknown }) => { obj[s.key] = s.value; });
    res.json(obj);
  } catch { res.json({}); }
});

export { publicRouter as brandingPublicRouter };

const router = Router();
router.use(authMiddleware, superAdminOnly);

router.get("/", async (_req: Request, res: Response) => {
  const settings = await SysSett.find();
  const obj: Record<string, unknown> = {};
  settings.forEach((s: { key: string; value: unknown }) => { obj[s.key] = s.value; });
  res.json(obj);
});

router.put("/", async (req: Request, res: Response) => {
  const entries = Object.entries(req.body as Record<string, unknown>);
  for (const [key, value] of entries) {
    await SysSett.findOneAndUpdate({ key }, { key, value }, { upsert: true, new: true });
  }
  res.json({ ok: true });
});

export default router;
