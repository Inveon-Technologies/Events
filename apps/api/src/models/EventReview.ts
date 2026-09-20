import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export class EventReview extends Model<InferAttributes<EventReview>, InferCreationAttributes<EventReview>> {
  declare id: CreationOptional<string>;
  declare bookingId: string;
  declare eventId: string;
  declare organizerId: string;
  declare rating: number;
  declare reviewText: string | null;
  declare customerName: string;
  declare readonly createdAt: CreationOptional<Date>;
}

// No updatedAt — like event_media, this is append-only from the
// customer's side; there's no edit-my-review flow, only submit once
// (the unique constraint on booking_id enforces that at the DB level,
// not just in application logic).
EventReview.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    bookingId: { type: DataTypes.UUID, allowNull: false, unique: true },
    eventId: { type: DataTypes.UUID, allowNull: false },
    organizerId: { type: DataTypes.UUID, allowNull: false },
    rating: { type: DataTypes.INTEGER, allowNull: false },
    reviewText: { type: DataTypes.TEXT, allowNull: true },
    customerName: { type: DataTypes.STRING, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'event_reviews', underscored: true, updatedAt: false },
);
