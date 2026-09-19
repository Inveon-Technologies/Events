import { Request, Response, NextFunction, RequestHandler } from 'express';

// Express 4 does not catch rejected promises from async route handlers on
// its own — an unhandled rejection from something like `await
// User.findOne(...)` (e.g. the database being briefly unreachable) is
// fatal to the whole Node process by default, not just that one request.
// Wrapping every async handler in this wires rejections into Express's
// normal next(err) error-handling path instead, so a transient DB/Redis
// failure produces one clean failed response — never a full crash, let
// alone the crash-restart loop that follows when a container's restart
// policy just keeps bringing back the same failure.
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
