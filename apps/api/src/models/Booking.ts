import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';
export type PaymentMethod = 'online' | 'cash';
export type CancelledBy = 'customer' | 'organizer';

export class Booking extends Model<InferAttributes<Booking>, InferCreationAttributes<Booking>> {
  declare id: CreationOptional<string>;
  declare eventId: string;
  declare bookingReference: string;
  declare primaryContactName: string;
  declare primaryContactWhatsapp: string;
  declare primaryContactEmail: string;
  declare primaryContactCity: string | null;
  declare status: CreationOptional<BookingStatus>;
  declare paymentMethod: PaymentMethod;
  declare totalAmountPaise: number;
  declare cancellationReason: string | null;
  declare cancelledBy: CancelledBy | null;
  declare refundAmountPaise: number | null;
  declare refundStatus: string | null;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

Booking.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    eventId: { type: DataTypes.UUID, allowNull: false },
    bookingReference: { type: DataTypes.STRING, allowNull: false, unique: true },
    primaryContactName: { type: DataTypes.STRING, allowNull: false },
    primaryContactWhatsapp: { type: DataTypes.STRING, allowNull: false },
    primaryContactEmail: { type: DataTypes.STRING, allowNull: false },
    primaryContactCity: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'confirmed', 'cancelled'), allowNull: false, defaultValue: 'pending' },
    paymentMethod: { type: DataTypes.ENUM('online', 'cash'), allowNull: false },
    totalAmountPaise: { type: DataTypes.INTEGER, allowNull: false },
    cancellationReason: { type: DataTypes.TEXT, allowNull: true },
    cancelledBy: { type: DataTypes.STRING, allowNull: true },
    refundAmountPaise: { type: DataTypes.INTEGER, allowNull: true },
    refundStatus: { type: DataTypes.STRING, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'bookings', underscored: true },
);
