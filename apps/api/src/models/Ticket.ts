import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export type TicketStatus = 'valid' | 'checked_in' | 'cancelled';

export class Ticket extends Model<InferAttributes<Ticket>, InferCreationAttributes<Ticket>> {
  declare id: CreationOptional<string>;
  declare bookingId: string;
  declare ticketCategoryId: string;
  declare attendeeName: string;
  declare attendeeAge: number | null;
  declare attendeeGender: string | null;
  declare qrToken: string;
  declare status: CreationOptional<TicketStatus>;
  declare checkedInAt: Date | null;
  declare checkedInByUserId: string | null;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

Ticket.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    bookingId: { type: DataTypes.UUID, allowNull: false },
    ticketCategoryId: { type: DataTypes.UUID, allowNull: false },
    attendeeName: { type: DataTypes.STRING, allowNull: false },
    attendeeAge: { type: DataTypes.INTEGER, allowNull: true },
    attendeeGender: { type: DataTypes.STRING, allowNull: true },
    qrToken: { type: DataTypes.STRING, allowNull: false, unique: true },
    status: { type: DataTypes.ENUM('valid', 'checked_in', 'cancelled'), allowNull: false, defaultValue: 'valid' },
    checkedInAt: { type: DataTypes.DATE, allowNull: true },
    checkedInByUserId: { type: DataTypes.UUID, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'tickets', underscored: true },
);
