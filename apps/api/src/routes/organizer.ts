import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { getOrganizerDashboard } from '../services/organizerDashboard';

export const organizerRouter = Router();

organizerRouter.use(authenticate, requireRole('organizer_owner', 'organizer_staff'));

organizerRouter.get('/dashboard', async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    // Shouldn't happen for these two roles (schema requires organizerId for
    // them), but fail clearly rather than silently querying with `undefined`.
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const dashboard = await getOrganizerDashboard(organizerId);
  res.status(200).json(dashboard);
});
