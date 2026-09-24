import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../middleware/asyncHandler';
import { getOrganizerDashboard } from '../services/organizerDashboard';
import { getOrganizerBookings, DisplayBookingStatus } from '../services/organizerBookings';
import { getOrganizerEvents, getEventFinancials, DisplayEventStatus, NotFoundError as FinancialsNotFoundError, ForbiddenError as FinancialsForbiddenError } from '../services/organizerEvents';
import {
  createOrganizerEvent,
  duplicateEvent,
  ValidationError,
  NotFoundError as EventCreationNotFoundError,
  ForbiddenError as EventCreationForbiddenError,
  CreateEventTicketTier,
} from '../services/eventCreation';
import { uploadEventMedia, deleteEventMedia, duplicateEventMedia, MediaValidationError, NotFoundError, ForbiddenError, MAX_FILE_SIZE_BYTES } from '../services/eventMedia';
import {
  submitOrganizerVerification,
  refreshOrganizerVerificationStatus,
  getOrganizerVerificationDetail,
  ValidationError as VerificationValidationError,
  NotFoundError as VerificationNotFoundError,
} from '../services/organizerVerification';
import { CashfreeNotConfiguredError } from '../services/cashfreeClient';
import {
  organizerCancelBooking,
  organizerCancelEvent,
  ValidationError as CancellationValidationError,
  NotFoundError as CancellationNotFoundError,
  ForbiddenError as CancellationForbiddenError,
} from '../services/bookingCancellation';
import {
  checkInTicket,
  undoCheckIn,
  NotFoundError as CheckInNotFoundError,
  ForbiddenError as CheckInForbiddenError,
  RejectedError as CheckInRejectedError,
} from '../services/ticketCheckIn';
import { getOrganizerTickets } from '../services/organizerTickets';
import { getOrganizerPayments } from '../services/organizerPayments';
import { searchVenues, VenueSearchError } from '../services/venueSearch';
import {
  getOrganizerProfile,
  updateOrganizerProfile,
  uploadOrganizerLogo,
  getOrganizerTeam,
  NotFoundError as ProfileNotFoundError,
  ValidationError as ProfileValidationError,
} from '../services/organizerProfile';
import {
  changePassword,
  NotFoundError as ChangePasswordNotFoundError,
  ValidationError as ChangePasswordValidationError,
  IncorrectPasswordError,
} from '../services/accountSecurity';
import {
  getOrganizerEvent,
  updateOrganizerEvent,
  deleteOrganizerEvent,
  NotFoundError as EventNotFoundError,
  ForbiddenError as EventForbiddenError,
} from '../services/eventManagement';
import {
  listApiCredentials,
  createApiCredential,
  revokeApiCredential,
  ValidationError as CredentialValidationError,
  NotFoundError as CredentialNotFoundError,
} from '../services/apiCredentials';
import {
  setEventGallery,
  ValidationError as GalleryValidationError,
  NotFoundError as GalleryNotFoundError,
  ForbiddenError as GalleryForbiddenError,
} from '../services/eventGallery';

// Undefined (field not sent) is distinct from null (explicitly clearing
// a restriction) — the caller decides which, this only rejects a
// genuinely invalid value. Anything other than 'male', 'female', or
// null/absent is silently ignored rather than erroring, matching how
// this route already treats other malformed optional fields.
function parseGenderRestriction(body: Record<string, unknown>): 'male' | 'female' | null | undefined {
  if (body.genderRestriction === 'male' || body.genderRestriction === 'female') return body.genderRestriction;
  if (body.genderRestriction === null || body.genderRestriction === '') return null;
  return undefined;
}

function parseTicketTiers(body: Record<string, unknown>) {
  const rawTiers = Array.isArray(body.ticketTiers) ? body.ticketTiers : [];
  return rawTiers.map((t) => {
    const tier = t as Record<string, unknown>;
    return {
      id: typeof tier.id === 'string' ? tier.id : undefined,
      name: typeof tier.name === 'string' ? tier.name : '',
      description: typeof tier.description === 'string' ? tier.description : undefined,
      price: typeof tier.price === 'number' ? tier.price : Number(tier.price) || 0,
      quantity: typeof tier.quantity === 'number' ? tier.quantity : Number(tier.quantity) || 0,
    };
  });
}

function parseScheduleItems(body: Record<string, unknown>) {
  const rawSchedule = Array.isArray(body.scheduleItems) ? body.scheduleItems : [];
  return rawSchedule.map((s) => {
    const item = s as Record<string, unknown>;
    return {
      time: typeof item.time === 'string' ? item.time : '',
      title: typeof item.title === 'string' ? item.title : '',
      description: typeof item.description === 'string' ? item.description : undefined,
    };
  });
}

function parsePackingChecklist(body: Record<string, unknown>) {
  const rawPacking = Array.isArray(body.packingChecklist) ? body.packingChecklist : [];
  return rawPacking.map((p) => {
    const item = p as Record<string, unknown>;
    return {
      item: typeof item.item === 'string' ? item.item : '',
      mandatory: item.mandatory !== false,
    };
  });
}

function parseFaqItems(body: Record<string, unknown>) {
  const rawFaq = Array.isArray(body.faqItems) ? body.faqItems : [];
  return rawFaq.map((f) => {
    const item = f as Record<string, unknown>;
    return {
      question: typeof item.question === 'string' ? item.question : '',
      answer: typeof item.answer === 'string' ? item.answer : '',
    };
  });
}

export const organizerRouter = Router();

// dest: os.tmpdir() — files land in a scratch location first; eventMedia.ts
// validates (size already capped here via limits.fileSize, type, video
// duration via ffprobe) before moving anything into the real, permanent
// upload directory. Nothing half-validated ever reaches where it's served
// from.
const mediaUpload = multer({ dest: os.tmpdir(), limits: { fileSize: MAX_FILE_SIZE_BYTES } });

// Access by role:
// - organizer_owner: everything.
// - organizer_staff: everything except the few actions that move money
//   or are irreversible (bank/payout details, cancelling or deleting a
//   whole event) — those go through ownerOnly below.
// - gate_volunteer: only what gate check-in needs — the event list to
//   pick an event, and scanning/undoing check-ins. Previously they were
//   locked out of the whole router, including check-in itself.
const GATE_VOLUNTEER_ROUTES: Array<{ method: string; pattern: RegExp }> = [
  { method: 'GET', pattern: /^\/events\/?$/ },
  { method: 'POST', pattern: /^\/events\/[^/]+\/checkin\/?$/ },
  { method: 'POST', pattern: /^\/events\/[^/]+\/checkin\/[^/]+\/undo\/?$/ },
];

organizerRouter.use(authenticate, (req, res, next) => {
  const role = req.user?.role;
  if (role === 'organizer_owner' || role === 'organizer_staff') {
    next();
    return;
  }
  if (role === 'gate_volunteer' && GATE_VOLUNTEER_ROUTES.some((r) => r.method === req.method && r.pattern.test(req.path))) {
    next();
    return;
  }
  res.status(403).json({ error: 'Forbidden' });
});

const ownerOnly = requireRole('organizer_owner');

organizerRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    // Shouldn't happen for these two roles (schema requires organizerId for
    // them), but fail clearly rather than silently querying with `undefined`.
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const dashboard = await getOrganizerDashboard(organizerId);
  res.status(200).json(dashboard);
}));

const VALID_STATUSES: Array<'all' | DisplayBookingStatus> = [
  'all',
  'confirmed',
  'pending',
  'cancelled',
  'partially_cancelled',
];
const VALID_SORTS = ['newest', 'oldest', 'amount_desc', 'amount_asc'] as const;

organizerRouter.get('/bookings', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const { eventId, status, search, sort, page, pageSize } = req.query;

  const statusParam = typeof status === 'string' && VALID_STATUSES.includes(status as never) ? (status as 'all' | DisplayBookingStatus) : 'all';
  const sortParam = typeof sort === 'string' && (VALID_SORTS as readonly string[]).includes(sort) ? (sort as (typeof VALID_SORTS)[number]) : 'newest';

  const result = await getOrganizerBookings({
    organizerId,
    eventId: typeof eventId === 'string' ? eventId : undefined,
    status: statusParam,
    search: typeof search === 'string' ? search : undefined,
    sort: sortParam,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });

  res.status(200).json(result);
}));

const VALID_EVENT_STATUSES: Array<'all' | DisplayEventStatus> = ['all', 'draft', 'published', 'completed', 'cancelled'];

organizerRouter.get('/events', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const { status } = req.query;
  const statusParam = typeof status === 'string' && VALID_EVENT_STATUSES.includes(status as never) ? (status as 'all' | DisplayEventStatus) : 'all';

  const result = await getOrganizerEvents({ organizerId, status: statusParam });
  res.status(200).json(result);
}));

organizerRouter.get('/events/:eventId/financials', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  try {
    const financials = await getEventFinancials(req.params.eventId, organizerId);
    res.status(200).json(financials);
  } catch (err) {
    if (err instanceof FinancialsNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof FinancialsForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.post('/events', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const status = body.status === 'draft' ? 'draft' : 'published';

  const ticketTiers: CreateEventTicketTier[] = parseTicketTiers(body);

  const scheduleItems = parseScheduleItems(body);
  const packingChecklist = parsePackingChecklist(body);
  const faqItems = parseFaqItems(body);

  try {
    const created = await createOrganizerEvent({
      organizerId,
      title: typeof body.title === 'string' ? body.title : '',
      shortDescription: typeof body.shortDescription === 'string' ? body.shortDescription : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      startDate: typeof body.startDate === 'string' ? body.startDate : '',
      startTime: typeof body.startTime === 'string' ? body.startTime : '',
      venueName: typeof body.venueName === 'string' ? body.venueName : undefined,
      address: typeof body.address === 'string' ? body.address : undefined,
      city: typeof body.city === 'string' ? body.city : undefined,
      state: typeof body.state === 'string' ? body.state : undefined,
      pincode: typeof body.pincode === 'string' ? body.pincode : undefined,
      venueLatitude: typeof body.venueLatitude === 'number' ? body.venueLatitude : undefined,
      venueLongitude: typeof body.venueLongitude === 'number' ? body.venueLongitude : undefined,
      bannerImage: typeof body.bannerImage === 'string' ? body.bannerImage : undefined,
      cancellationPolicyDescription: typeof body.cancellationPolicy === 'string' ? body.cancellationPolicy : undefined,
      allowSelfServiceCancellation: typeof body.allowSelfServiceCancellation === 'boolean' ? body.allowSelfServiceCancellation : undefined,
      refundCutoffDays: typeof body.refundCutoffDays === 'number' ? body.refundCutoffDays : undefined,
      refundPercentage: typeof body.refundPercentage === 'number' ? body.refundPercentage : undefined,
      ticketTiers,
      scheduleItems,
      packingChecklist,
      faqItems,
      status,
      genderRestriction: parseGenderRestriction(body),
    });
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.get('/events/:eventId', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  try {
    const event = await getOrganizerEvent(req.params.eventId, organizerId);
    res.status(200).json(event);
  } catch (err) {
    if (err instanceof EventNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof EventForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.patch('/events/:eventId', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const body = req.body as Record<string, unknown>;

  try {
    const updated = await updateOrganizerEvent({
      eventId: req.params.eventId,
      organizerId,
      title: typeof body.title === 'string' ? body.title : undefined,
      shortDescription: typeof body.shortDescription === 'string' ? body.shortDescription : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      startDate: typeof body.startDate === 'string' ? body.startDate : undefined,
      startTime: typeof body.startTime === 'string' ? body.startTime : undefined,
      venueName: typeof body.venueName === 'string' ? body.venueName : undefined,
      address: typeof body.address === 'string' ? body.address : undefined,
      city: typeof body.city === 'string' ? body.city : undefined,
      state: typeof body.state === 'string' ? body.state : undefined,
      pincode: typeof body.pincode === 'string' ? body.pincode : undefined,
      venueLatitude: typeof body.venueLatitude === 'number' ? body.venueLatitude : undefined,
      venueLongitude: typeof body.venueLongitude === 'number' ? body.venueLongitude : undefined,
      bannerImage: typeof body.bannerImage === 'string' ? body.bannerImage : undefined,
      cancellationPolicy: typeof body.cancellationPolicy === 'string' ? body.cancellationPolicy : undefined,
      allowSelfServiceCancellation: typeof body.allowSelfServiceCancellation === 'boolean' ? body.allowSelfServiceCancellation : undefined,
      refundCutoffDays: typeof body.refundCutoffDays === 'number' ? body.refundCutoffDays : undefined,
      refundPercentage: typeof body.refundPercentage === 'number' ? body.refundPercentage : undefined,
      ticketTiers: body.ticketTiers !== undefined ? parseTicketTiers(body) : undefined,
      scheduleItems: body.scheduleItems !== undefined ? parseScheduleItems(body) : undefined,
      packingChecklist: body.packingChecklist !== undefined ? parsePackingChecklist(body) : undefined,
      faqItems: body.faqItems !== undefined ? parseFaqItems(body) : undefined,
      status: body.status === 'draft' || body.status === 'published' || body.status === 'closed' ? body.status : undefined,
      genderRestriction: parseGenderRestriction(body),
    });
    res.status(200).json(updated);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof EventNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof EventForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.delete('/events/:eventId', ownerOnly, asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  try {
    await deleteOrganizerEvent(req.params.eventId, organizerId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof EventNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof EventForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.post(
  '/events/:eventId/media',
  // multer invoked manually (not as plain route middleware) so its own
  // errors — file too large, a malformed multipart body — can be
  // turned into a clean 400 here, rather than propagating to Express's
  // default error handling as an unrelated-looking 500.
  (req, res, next) => {
    mediaUpload.single('file')(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: `File is too large — the limit is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB` });
          return;
        }
        res.status(400).json({ error: 'Upload failed — please try again' });
        return;
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const organizerId = req.user?.organizerId;
    if (!organizerId) {
      res.status(400).json({ error: 'This account has no associated organizer' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No file was uploaded' });
      return;
    }

    try {
      const media = await uploadEventMedia({
        organizerId,
        eventId: req.params.eventId,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        tempFilePath: req.file.path,
      });
      res.status(201).json(media);
    } catch (err) {
      if (err instanceof MediaValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message });
        return;
      }
      throw err;
    }
  }),
);

organizerRouter.delete('/events/:eventId/media/:mediaId', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  try {
    await deleteEventMedia(organizerId, req.params.eventId, req.params.mediaId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.get('/verification', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const detail = await getOrganizerVerificationDetail(organizerId);
  res.status(200).json(detail);
}));

organizerRouter.post('/verification', ownerOnly, asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const accountType = body.accountType === 'business' ? 'business' : 'individual';

  try {
    const result = await submitOrganizerVerification({
      organizerId,
      panNumber: typeof body.panNumber === 'string' ? body.panNumber : '',
      accountType,
      businessType: typeof body.businessType === 'string' ? body.businessType : undefined,
      contactPhone: typeof body.contactPhone === 'string' ? body.contactPhone : '',
      bankAccountHolderName: typeof body.bankAccountHolderName === 'string' ? body.bankAccountHolderName : '',
      bankAccountNumber: typeof body.bankAccountNumber === 'string' ? body.bankAccountNumber : '',
      bankIfsc: typeof body.bankIfsc === 'string' ? body.bankIfsc : '',
    });
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof VerificationValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof VerificationNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof CashfreeNotConfiguredError) {
      res.status(503).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.post('/verification/refresh', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  try {
    const result = await refreshOrganizerVerificationStatus(organizerId);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof VerificationValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof VerificationNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof CashfreeNotConfiguredError) {
      res.status(503).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.post('/bookings/:bookingId/cancel', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }
  const { reason } = req.body as Record<string, unknown>;
  if (typeof reason !== 'string') {
    res.status(400).json({ error: 'A cancellation reason is required' });
    return;
  }

  try {
    const result = await organizerCancelBooking(req.params.bookingId, organizerId, reason);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof CancellationNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof CancellationForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err instanceof CancellationValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.post('/events/:eventId/cancel', ownerOnly, asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }
  const { reason } = req.body as Record<string, unknown>;
  if (typeof reason !== 'string') {
    res.status(400).json({ error: 'A cancellation reason is required' });
    return;
  }

  try {
    const result = await organizerCancelEvent(req.params.eventId, organizerId, reason);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof CancellationNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof CancellationForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err instanceof CancellationValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.post('/events/:eventId/checkin', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  const userId = req.user?.sub;
  if (!organizerId || !userId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }
  const { qrToken } = req.body as Record<string, unknown>;
  if (typeof qrToken !== 'string' || !qrToken.trim()) {
    res.status(400).json({ error: 'A QR code value is required' });
    return;
  }

  try {
    const result = await checkInTicket({ eventId: req.params.eventId, organizerId, qrToken, checkedInByUserId: userId });
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof CheckInNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof CheckInForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err instanceof CheckInRejectedError) {
      res.status(409).json({ error: err.message, reasonCode: err.reasonCode, details: err.details });
      return;
    }
    throw err;
  }
}));

organizerRouter.post('/events/:eventId/checkin/:ticketId/undo', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  try {
    const result = await undoCheckIn(req.params.eventId, organizerId, req.params.ticketId);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof CheckInNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof CheckInForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err instanceof CheckInRejectedError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.get('/tickets', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const { eventId, status, search } = req.query;
  const result = await getOrganizerTickets({
    organizerId,
    eventId: typeof eventId === 'string' ? eventId : undefined,
    status: typeof status === 'string' && ['all', 'valid', 'checked_in', 'cancelled'].includes(status) ? (status as 'all' | 'valid' | 'checked_in' | 'cancelled') : undefined,
    search: typeof search === 'string' ? search : undefined,
  });
  res.status(200).json(result);
}));

organizerRouter.get('/payments', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const result = await getOrganizerPayments(organizerId);
  res.status(200).json(result);
}));

organizerRouter.get('/profile', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }
  try {
    const profile = await getOrganizerProfile(organizerId);
    res.status(200).json(profile);
  } catch (err) {
    if (err instanceof ProfileNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.patch('/profile', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }
  const body = req.body as Record<string, unknown>;
  try {
    const profile = await updateOrganizerProfile({
      organizerId,
      name: typeof body.name === 'string' ? body.name : undefined,
      contactEmail: typeof body.contactEmail === 'string' ? body.contactEmail : undefined,
      contactPhone: typeof body.contactPhone === 'string' ? body.contactPhone : undefined,
      about: typeof body.about === 'string' ? body.about : undefined,
      gstNumber: typeof body.gstNumber === 'string' ? body.gstNumber : undefined,
      website: typeof body.website === 'string' ? body.website : undefined,
    });
    res.status(200).json(profile);
  } catch (err) {
    if (err instanceof ProfileNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ProfileValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.post(
  '/profile/logo',
  (req, res, next) => {
    mediaUpload.single('file')(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: `File is too large — the limit is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB` });
          return;
        }
        res.status(400).json({ error: 'Upload failed — please try again' });
        return;
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const organizerId = req.user?.organizerId;
    if (!organizerId) {
      res.status(400).json({ error: 'This account has no associated organizer' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No file was uploaded' });
      return;
    }
    try {
      const result = await uploadOrganizerLogo({
        organizerId,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        tempFilePath: req.file.path,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ProfileNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof ProfileValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  }),
);

organizerRouter.get('/team', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }
  const team = await getOrganizerTeam(organizerId);
  res.status(200).json({ team });
}));

organizerRouter.post('/change-password', asyncHandler(async (req, res) => {
  const userId = req.user?.sub;
  if (!userId) {
    res.status(400).json({ error: 'Not authenticated' });
    return;
  }
  const { currentPassword, newPassword } = req.body as Record<string, unknown>;
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    res.status(400).json({ error: 'Current and new password are required' });
    return;
  }

  try {
    await changePassword(userId, currentPassword, newPassword);
    res.status(200).json({ success: true });
  } catch (err) {
    if (err instanceof ChangePasswordNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ChangePasswordValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof IncorrectPasswordError) {
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.post('/events/:eventId/duplicate', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  try {
    const result = await duplicateEvent(req.params.eventId, organizerId);
    // Media duplication is a separate, best-effort follow-up step —
    // the new event record itself (already committed) is the part
    // that must never be left half-created if this second step fails.
    try {
      await duplicateEventMedia(req.params.eventId, result.id, organizerId);
    } catch (mediaErr) {
      // eslint-disable-next-line no-console
      console.error(`Failed to duplicate media for event ${req.params.eventId} -> ${result.id}:`, mediaErr);
    }
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof EventCreationNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof EventCreationForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.get('/venue-search', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  try {
    const results = await searchVenues(q);
    res.status(200).json({ results });
  } catch (err) {
    if (err instanceof VenueSearchError) {
      res.status(502).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

// Post-event photos & videos: the organizer's own Google Drive / Google
// Photos share link, shown to attendees on their booking page.
organizerRouter.put('/events/:eventId/gallery', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  try {
    const result = await setEventGallery({
      eventId: req.params.eventId,
      organizerId,
      url: typeof body.url === 'string' ? body.url : null,
      note: typeof body.note === 'string' ? body.note : null,
    });
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof GalleryValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof GalleryNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof GalleryForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

// Settings → Integrations: app key + secret pairs for the organizer's
// own website/app to read their events through /api/v1. Owner-only —
// a key grants access to all of the organization's event data.
organizerRouter.get('/integrations/keys', ownerOnly, asyncHandler(async (req, res) => {
  res.status(200).json({ keys: await listApiCredentials(req.user!.organizerId!) });
}));

organizerRouter.post('/integrations/keys', ownerOnly, asyncHandler(async (req, res) => {
  const { name } = req.body as Record<string, unknown>;
  try {
    const created = await createApiCredential({
      organizerId: req.user!.organizerId!,
      userId: req.user!.sub,
      name: typeof name === 'string' ? name : '',
    });
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof CredentialValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

organizerRouter.delete('/integrations/keys/:keyId', ownerOnly, asyncHandler(async (req, res) => {
  try {
    await revokeApiCredential(req.user!.organizerId!, req.params.keyId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof CredentialNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}));
