import { QueryInterface, DataTypes } from 'sequelize';

// One review per booking (unique constraint on booking_id) — a customer
// who booked multiple tickets to the same event in one booking leaves
// one review for that booking, not one per ticket. event_id and
// organizer_id are denormalized from the booking's event rather than
// joined through it every time an aggregate rating is computed (events
// and organizers show these constantly — the homepage, event cards,
// organizer profiles — a booking->event->organizer join on every one of
// those reads would be real, avoidable cost for data that never changes
// after the review is created).
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.createTable('event_reviews', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'bookings', key: 'id' },
      onDelete: 'CASCADE',
    },
    event_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'events', key: 'id' },
      onDelete: 'CASCADE',
    },
    organizer_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizers', key: 'id' },
      onDelete: 'CASCADE',
    },
    rating: { type: DataTypes.INTEGER, allowNull: false },
    review_text: { type: DataTypes.TEXT, allowNull: true },
    customer_name: { type: DataTypes.STRING, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await qi.sequelize.query(
    'ALTER TABLE event_reviews ADD CONSTRAINT event_reviews_rating_range CHECK (rating >= 1 AND rating <= 5);',
  );

  await qi.addIndex('event_reviews', ['event_id']);
  await qi.addIndex('event_reviews', ['organizer_id']);
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.dropTable('event_reviews');
}
