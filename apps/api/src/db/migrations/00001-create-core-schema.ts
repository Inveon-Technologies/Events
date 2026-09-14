import { DataTypes, QueryInterface } from 'sequelize';

// Initial schema (BE-01). Per the roadmap's own note: "get
// organizer/event/ticket_categories/bookings/tickets locked first since
// almost everything else depends on it; attendee custom-questions and
// certificates can evolve later." Those later-evolving tables are still
// included below (event_custom_questions, ticket_custom_answers,
// event_media, certificates) but kept deliberately minimal — expect them
// to change shape once FE-02/FE-03 (event/ticket creation UI) and Phase 3
// (post-event features) land.
//
// Money is stored as an integer in the smallest currency unit (paise, for
// INR) rather than a float/decimal, to avoid floating-point rounding bugs
// in anything touching payment totals.

export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  await qi.createTable('organizers', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    contact_email: { type: DataTypes.STRING, allowNull: true },
    contact_phone: { type: DataTypes.STRING, allowNull: true },
    logo_url: { type: DataTypes.STRING, allowNull: true },
    about: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  // Covers platform admins, organizer owners/staff, and gate volunteers.
  // Per business doc §30, dedicated *restricted* volunteer-only accounts
  // are explicitly future scope — this role is deliberately coarse for now.
  await qi.sequelize.query(
    "CREATE TYPE enum_users_role AS ENUM ('platform_admin', 'organizer_owner', 'organizer_staff');",
  );
  await qi.createTable('users', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizer_id: {
      type: DataTypes.UUID,
      allowNull: true, // null for platform_admin
      references: { model: 'organizers', key: 'id' },
      onDelete: 'CASCADE',
    },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING, allowNull: false },
    role: { type: 'enum_users_role', allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await qi.sequelize.query(
    "CREATE TYPE enum_events_status AS ENUM ('draft', 'published', 'closed');",
  );
  await qi.createTable('events', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizer_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizers', key: 'id' },
      onDelete: 'CASCADE',
    },
    name: { type: DataTypes.STRING, allowNull: false },
    tagline: { type: DataTypes.STRING, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    venue_address: { type: DataTypes.TEXT, allowNull: true },
    venue_map_url: { type: DataTypes.STRING, allowNull: true },
    event_date: { type: DataTypes.DATE, allowNull: false },
    gate_open_time: { type: DataTypes.DATE, allowNull: true },
    banner_url: { type: DataTypes.STRING, allowNull: true },
    terms_and_conditions: { type: DataTypes.TEXT, allowNull: true },
    cancellation_policy: { type: DataTypes.TEXT, allowNull: true },
    status: { type: 'enum_events_status', allowNull: false, defaultValue: 'draft' },
    capacity: { type: DataTypes.INTEGER, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('events', ['organizer_id']);

  await qi.createTable('ticket_categories', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    event_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'events', key: 'id' },
      onDelete: 'CASCADE',
    },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    price_paise: { type: DataTypes.INTEGER, allowNull: false },
    max_per_booking: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
    quota_total: { type: DataTypes.INTEGER, allowNull: false },
    // Denormalized running counter, not the sole source of truth for
    // "is there a ticket left" — BE-11's atomic reservation logic still
    // needs to guard the actual decrement with row locking / a
    // transaction against `tickets` to prevent overselling. This column
    // exists so read-heavy pages (dashboard, listing) don't have to
    // COUNT(*) tickets on every request.
    quota_remaining: { type: DataTypes.INTEGER, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('ticket_categories', ['event_id']);

  await qi.sequelize.query(
    "CREATE TYPE enum_bookings_status AS ENUM ('pending', 'confirmed', 'cancelled');",
  );
  await qi.sequelize.query(
    "CREATE TYPE enum_bookings_payment_method AS ENUM ('online', 'cash');",
  );
  await qi.createTable('bookings', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    event_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'events', key: 'id' },
      onDelete: 'RESTRICT',
    },
    booking_reference: { type: DataTypes.STRING, allowNull: false, unique: true },
    primary_contact_name: { type: DataTypes.STRING, allowNull: false },
    // Business doc §13: WhatsApp is the primary delivery channel.
    primary_contact_whatsapp: { type: DataTypes.STRING, allowNull: false },
    primary_contact_email: { type: DataTypes.STRING, allowNull: false },
    primary_contact_city: { type: DataTypes.STRING, allowNull: true },
    status: { type: 'enum_bookings_status', allowNull: false, defaultValue: 'pending' },
    payment_method: { type: 'enum_bookings_payment_method', allowNull: false },
    total_amount_paise: { type: DataTypes.INTEGER, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('bookings', ['event_id']);
  await qi.addIndex('bookings', ['status']);

  await qi.sequelize.query(
    "CREATE TYPE enum_tickets_status AS ENUM ('valid', 'checked_in', 'cancelled');",
  );
  await qi.createTable('tickets', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'bookings', key: 'id' },
      onDelete: 'CASCADE',
    },
    ticket_category_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'ticket_categories', key: 'id' },
      onDelete: 'RESTRICT',
    },
    attendee_name: { type: DataTypes.STRING, allowNull: false },
    attendee_age: { type: DataTypes.INTEGER, allowNull: true },
    attendee_gender: { type: DataTypes.STRING, allowNull: true },
    // The opaque, unguessable value encoded in the ticket's QR code —
    // deliberately not the ticket's own id, so a leaked/guessed id can't
    // be used to check someone in. SEC-01 (Phase 4) should confirm this
    // is generated with a CSPRNG, not swap the mechanism.
    qr_token: { type: DataTypes.STRING, allowNull: false, unique: true },
    status: { type: 'enum_tickets_status', allowNull: false, defaultValue: 'valid' },
    checked_in_at: { type: DataTypes.DATE, allowNull: true },
    checked_in_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('tickets', ['booking_id']);
  await qi.addIndex('tickets', ['ticket_category_id']);
  await qi.addIndex('tickets', ['qr_token'], { unique: true });

  await qi.sequelize.query(
    "CREATE TYPE enum_payments_method AS ENUM ('online', 'cash');",
  );
  await qi.sequelize.query(
    "CREATE TYPE enum_payments_status AS ENUM ('pending', 'paid', 'failed', 'refunded');",
  );
  await qi.createTable('payments', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'bookings', key: 'id' },
      onDelete: 'CASCADE',
    },
    amount_paise: { type: DataTypes.INTEGER, allowNull: false },
    method: { type: 'enum_payments_method', allowNull: false },
    gateway_reference: { type: DataTypes.STRING, allowNull: true },
    status: { type: 'enum_payments_status', allowNull: false, defaultValue: 'pending' },
    // Cash-payment approval trail (business doc §18).
    verified_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    verified_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('payments', ['booking_id']);

  await qi.sequelize.query(
    "CREATE TYPE enum_cancellations_status AS ENUM ('pending', 'approved', 'rejected');",
  );
  await qi.createTable('cancellations', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'bookings', key: 'id' },
      onDelete: 'CASCADE',
    },
    reason: { type: DataTypes.TEXT, allowNull: true },
    status: { type: 'enum_cancellations_status', allowNull: false, defaultValue: 'pending' },
    // Refund percentage/fee rules are explicitly "to be finalized
    // separately" per the business doc §30 — this column just records
    // the outcome once a human (or, later, a rule engine) decides it.
    refund_amount_paise: { type: DataTypes.INTEGER, allowNull: true },
    refunded_at: { type: DataTypes.DATE, allowNull: true },
    processed_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('cancellations', ['booking_id']);

  // --- Deliberately minimal, expected to evolve (see file header) ---

  await qi.createTable('event_custom_questions', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    event_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'events', key: 'id' },
      onDelete: 'CASCADE',
    },
    question_text: { type: DataTypes.STRING, allowNull: false },
    is_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await qi.createTable('ticket_custom_answers', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tickets', key: 'id' },
      onDelete: 'CASCADE',
    },
    question_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'event_custom_questions', key: 'id' },
      onDelete: 'CASCADE',
    },
    answer_text: { type: DataTypes.TEXT, allowNull: true },
  });

  await qi.sequelize.query(
    "CREATE TYPE enum_event_media_type AS ENUM ('photo', 'video');",
  );
  await qi.createTable('event_media', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    event_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'events', key: 'id' },
      onDelete: 'CASCADE',
    },
    media_type: { type: 'enum_event_media_type', allowNull: false },
    url: { type: DataTypes.STRING, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('event_media', ['event_id']);

  await qi.createTable('certificates', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tickets', key: 'id' },
      onDelete: 'CASCADE',
    },
    certificate_number: { type: DataTypes.STRING, allowNull: false, unique: true },
    pdf_url: { type: DataTypes.STRING, allowNull: true },
    issued_at: { type: DataTypes.DATE, allowNull: true },
  });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  // Reverse dependency order.
  await qi.dropTable('certificates');
  await qi.dropTable('event_media');
  await qi.sequelize.query('DROP TYPE IF EXISTS enum_event_media_type;');
  await qi.dropTable('ticket_custom_answers');
  await qi.dropTable('event_custom_questions');
  await qi.dropTable('cancellations');
  await qi.sequelize.query('DROP TYPE IF EXISTS enum_cancellations_status;');
  await qi.dropTable('payments');
  await qi.sequelize.query('DROP TYPE IF EXISTS enum_payments_status;');
  await qi.sequelize.query('DROP TYPE IF EXISTS enum_payments_method;');
  await qi.dropTable('tickets');
  await qi.sequelize.query('DROP TYPE IF EXISTS enum_tickets_status;');
  await qi.dropTable('bookings');
  await qi.sequelize.query('DROP TYPE IF EXISTS enum_bookings_payment_method;');
  await qi.sequelize.query('DROP TYPE IF EXISTS enum_bookings_status;');
  await qi.dropTable('ticket_categories');
  await qi.dropTable('events');
  await qi.sequelize.query('DROP TYPE IF EXISTS enum_events_status;');
  await qi.dropTable('users');
  await qi.sequelize.query('DROP TYPE IF EXISTS enum_users_role;');
  await qi.dropTable('organizers');
}
