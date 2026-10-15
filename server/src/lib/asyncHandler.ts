import type { NextFunction, Request, Response } from "express";

/**
 * Wraps an async route handler so that a thrown error (or rejected promise) goes to
 * the central error handler instead of crashing the request.
 *
 *   router.get("/", asyncHandler(async (req, res) => { ... }));
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
