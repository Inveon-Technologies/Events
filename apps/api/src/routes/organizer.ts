import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../middleware/asyncHandler';
import { Organizer } from '../models';
import { getOrganizerDashboard } from '../services/organizerDashboard';
import { getOrganizerBookings, DisplayBookingStatus } from '../services/organizerBookings';
import { getOrganizerEvents, DisplayEventStatus } from '../services/organizerEvents';
import { createOrganizerEvent, ValidationError, CreateEventTicketTier } from '../services/eventCreation';
import { uploadEventMedia, deleteEventMedia, MediaValidationError, NotFoundError, ForbiddenError, MAX_FILE_SIZE_BYTES } from '../services/eventMedia';
import {
  submitOrganizerVerification,
  refreshOrganizerVerificationStatus,
  ValidationError as VerificationValidationError,
  NotFoundError as VerificationNotFoundError,
} from '../services/organizerVerification';
import {
  getOrganizerEvent,
  updateOrganizerEvent,
  deleteOrganizerEvent,
  NotFoundError as EventNotFoundError,
  ForbiddenError as EventForbiddenError,
} from '../services/eventManagement';

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

organizerRouter.use(authenticate, requireRole('organizer_owner', 'organizer_staff'));

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
      bannerImage: typeof body.bannerImage === 'string' ? body.bannerImage : undefined,
      cancellationPolicyDescription:
        typeof body.cancellationPolicy === 'object' && body.cancellationPolicy !== null
          ? String((body.cancellationPolicy as Record<string, unknown>).description ?? '')
          : undefined,
      ticketTiers,
      scheduleItems,
      packingChecklist,
      faqItems,
      status,
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
      bannerImage: typeof body.bannerImage === 'string' ? body.bannerImage : undefined,
      ticketTiers: body.ticketTiers !== undefined ? parseTicketTiers(body) : undefined,
      scheduleItems: body.scheduleItems !== undefined ? parseScheduleItems(body) : undefined,
      packingChecklist: body.packingChecklist !== undefined ? parsePackingChecklist(body) : undefined,
      faqItems: body.faqItems !== undefined ? parseFaqItems(body) : undefined,
      status: body.status === 'draft' || body.status === 'published' || body.status === 'closed' ? body.status : undefined,
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

organizerRouter.delete('/events/:eventId', asyncHandler(async (req, res) => {
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

  const organizer = await Organizer.findByPk(organizerId);
  if (!organizer) {
    res.status(404).json({ error: 'Organizer not found' });
    return;
  }

  res.status(200).json({
    cashfreeVendorStatus: organizer.cashfreeVendorStatus,
    panNumber: organizer.panNumber,
    kycAccountType: organizer.kycAccountType,
    businessType: organizer.businessType,
    bankAccountHolderName: organizer.bankAccountHolderName,
    bankAccountNumberLast4: organizer.bankAccountNumberLast4,
    bankIfsc: organizer.bankIfsc,
  });
}));

organizerRouter.post('/verification', asyncHandler(async (req, res) => {
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
    throw err;
  }
}));
