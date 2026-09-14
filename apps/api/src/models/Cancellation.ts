import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export type CancellationStatus = 'pending' | 'approved' | 'rejected';

export class Cancellation extends Model<InferAttributes<Cancellation>, InferCreationAttributes<Cancellation>> {
  declare id: CreationOptional<string>;
  declare bookingId: string;
  declare reason: string | null;
  declare status: CreationOptional<CancellationStatus>;
  declare refundAmountPaise: number | null;
  declare refundedAt: Date | null;
  declare processedByUserId: string | null;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

Cancellation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    bookingId: { type: DataTypes.UUID, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
    refundAmountPaise: { type: DataTypes.INTEGER, allowNull: true },
    refundedAt: { type: DataTypes.DATE, allowNull: true },
    processedByUserId: { type: DataTypes.UUID, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'cancellations', underscored: true },
);
