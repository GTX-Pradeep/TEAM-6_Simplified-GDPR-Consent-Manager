import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { authorize } from "../../middleware/requireRole";
import * as notices from "./notices.service";

/** Mounted at /api/v1/me/notices (FR-16). A user only ever sees his or her own notices. */
export const noticesRouter = Router();

const idParam = z.object({ id: z.string().uuid("Invalid notice id") });

/** GET /api/v1/me/notices -> {notices: [{id, policy, purposes}]} */
noticesRouter.get(
  "/",
  authorize("USER"),
  asyncHandler(async (req, res) => {
    res.json({ notices: await notices.getMyNotices(req.user!.id) });
  }),
);

/** POST /api/v1/me/notices/:id/reconfirm -> {reconfirmed: n}  keep my choices under the new version */
noticesRouter.post(
  "/:id/reconfirm",
  authorize("USER"),
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await notices.reconfirm(req.user!.id, id));
  }),
);

/** POST /api/v1/me/notices/:id/ack -> 204  "I have reviewed the change" */
noticesRouter.post(
  "/:id/ack",
  authorize("USER"),
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    await notices.acknowledge(req.user!.id, id);
    res.status(204).end();
  }),
);
