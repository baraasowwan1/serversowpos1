/**
 * Store Users/Employees Routes — مستخدمو المتجر (الموظفون)
 */
import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";
import { requirePermission, ownerOnly } from "../middleware/roleGuard";
import { logAudit } from "./audit";

const router = Router();
router.use(authMiddleware);

function errRes(res: Response, req: AuthRequest, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, code, message, requestId: req.requestId });
}

// ── GET / — جميع موظفي المتجر ─────────────────────────────────────────────────
router.get("/", requirePermission("users:read"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const users = await User.find({ storeId: scope.storeId }).select("-password").lean();
    res.json(users.map(u => ({
      id:         (u as { _id: unknown })._id,
      name:       (u as { name: string }).name,
      email:      (u as { email: string }).email,
      role:       (u as { role: string }).role,
      status:     (u as { status: string }).status,
      phone:      (u as { phone?: string }).phone || "",
      shift:      (u as { shift?: string }).shift || "flexible",
      shiftStart: (u as { shiftStart?: string }).shiftStart || "",
      shiftEnd:   (u as { shiftEnd?: string }).shiftEnd || "",
      branch:     (u as { branchName?: string }).branchName || "",
    })));
  } catch {
    return errRes(res, req, 500, "FETCH_ERROR", "خطأ في جلب الموظفين");
  }
});

// ── POST / — إضافة موظف جديد ──────────────────────────────────────────────────
router.post("/", ownerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const { name, email, phone, role, password, branch, shift, shiftStart, shiftEnd } = req.body;
    if (!name?.trim()) return errRes(res, req, 400, "MISSING_NAME",  "الاسم مطلوب");
    if (!email?.trim()) return errRes(res, req, 400, "MISSING_EMAIL", "البريد الإلكتروني مطلوب");

    const validRoles   = ["owner","manager","cashier","inventory","accountant"];
    const validShifts  = ["morning","evening","night","flexible"];
    const safeRole  = validRoles.includes(role)  ? role  : "cashier";
    const safeShift = validShifts.includes(shift) ? shift : "flexible";

    // Email uniqueness
    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) return errRes(res, req, 409, "EMAIL_EXISTS", "هذا البريد الإلكتروني مستخدم بالفعل");

    const rawPass = password || `Emp@${Math.floor(Math.random() * 90000) + 10000}!`;
    const hashed  = await bcrypt.hash(rawPass, 10);

    const user = await User.create({
      storeId: scope.storeId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone || "",
      password: hashed,
      role: safeRole,
      status: "active",
      branchName: branch || "",
      shift: safeShift,
      shiftStart: shiftStart || "",
      shiftEnd: shiftEnd || "",
      createdBy: req.userId || undefined,
    });

    logAudit({ req, action: "إضافة موظف", category: "user", target: name, details: { role: safeRole } });

    return res.status(201).json({
      success: true,
      data: {
        id:    (user as { _id: unknown })._id,
        name:  (user as { name: string }).name,
        email: (user as { email: string }).email,
        role:  (user as { role: string }).role,
        generatedPassword: rawPass,
      },
    });
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code === 11000) return errRes(res, req, 409, "DUPLICATE_EMAIL", "البريد الإلكتروني مستخدم مسبقاً");
    return errRes(res, req, 500, "CREATE_ERROR", "خطأ في إضافة الموظف");
  }
});

// ── PUT /:id — تعديل موظف ─────────────────────────────────────────────────────
router.put("/:id", ownerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const { name, phone, role, status, password, shift, shiftStart, shiftEnd, branch } = req.body;

    const validRoles    = ["owner","manager","cashier","inventory","accountant"];
    const validStatuses = ["active","suspended"];
    const validShifts   = ["morning","evening","night","flexible"];

    const update: Record<string, unknown> = {};
    if (name)             update["name"]       = name.trim();
    if (phone !== undefined) update["phone"]   = phone;
    if (role)             update["role"]        = validRoles.includes(role)    ? role    : "cashier";
    if (status)           update["status"]      = validStatuses.includes(status) ? status : "active";
    if (shift)            update["shift"]       = validShifts.includes(shift)  ? shift   : "flexible";
    if (shiftStart !== undefined) update["shiftStart"] = shiftStart;
    if (shiftEnd   !== undefined) update["shiftEnd"]   = shiftEnd;
    if (branch     !== undefined) update["branchName"] = branch;
    if (password && typeof password === "string" && password.length >= 6) {
      update["password"] = await bcrypt.hash(password, 10);
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params["id"], storeId: scope.storeId },
      update,
      { new: true }
    ).select("-password");
    if (!user) return errRes(res, req, 404, "NOT_FOUND", "المستخدم غير موجود");

    if (role) logAudit({ req, action: "تغيير دور موظف", category: "user", target: req.params["id"], details: { role } });

    return res.json({ success: true, data: user });
  } catch {
    return errRes(res, req, 500, "UPDATE_ERROR", "خطأ في تعديل الموظف");
  }
});

// ── DELETE /:id — حذف موظف (soft: mark suspended) ────────────────────────────
router.delete("/:id", ownerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const targetId = req.params["id"];

    // Protect owner account from deletion
    const target = await User.findOne({ _id: targetId, storeId: scope.storeId });
    if (!target) return errRes(res, req, 404, "NOT_FOUND", "المستخدم غير موجود");
    if ((target as { role: string }).role === "owner" && String((target as { _id: unknown })._id) === req.userId) {
      return errRes(res, req, 403, "CANNOT_DELETE_SELF", "لا يمكن حذف حساب المالك الخاص");
    }

    // Soft delete: suspend instead of hard delete to preserve audit history
    await User.findByIdAndUpdate(targetId, { status: "suspended", deletedAt: new Date(), deletedBy: req.userId });

    logAudit({ req, action: "حذف موظف", category: "user", target: targetId });
    return res.json({ success: true, message: "تم تعطيل حساب الموظف" });
  } catch {
    return errRes(res, req, 500, "DELETE_ERROR", "خطأ في حذف الموظف");
  }
});

export default router;
