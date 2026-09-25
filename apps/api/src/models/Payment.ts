import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type CollectionMode = 'split' | 'platform';
export type SettlementStatus = 'pending' | 'settled';

export class Payment extends Model<InferAttributes<Payment>, InferCreationAttributes<Payment>> {
  declare id: CreationOptional<string>;
  declare bookingId: string;
  declare amountPaise: number;
  declare method: 'online' | 'cash';
  declare gatewayReference: string | null;
  declare status: CreationOptional<PaymentStatus>;
  declare verifiedByUserId: string | null;
  declare verifiedAt: Date | null;
  declare collectionMode: CreationOptional<CollectionMode | null>;
  declare organizerId: CreationOptional<string | null>;
  declare customerName: CreationOptional<string | null>;
  declare organizerSharePaise: CreationOptional<number | null>;
  declare settlementStatus: CreationOptional<SettlementStatus | null>;
  declare settledAt: CreationOptional<Date | null>;
  declare settlementReference: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

Payment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    bookingId: { type: DataTypes.UUID, allowNull: false },
    amountPaise: { type: DataTypes.INTEGER, allowNull: false },
    method: { type: DataTypes.ENUM('online', 'cash'), allowNull: false },
    gatewayReference: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'), allowNull: false, defaultValue: 'pending' },
    verifiedByUserId: { type: DataTypes.UUID, allowNull: true },
    verifiedAt: { type: DataTypes.DATE, allowNull: true },
    collectionMode: { type: DataTypes.STRING(16), allowNull: true },
    organizerId: { type: DataTypes.UUID, allowNull: true },
    customerName: { type: DataTypes.STRING, allowNull: true },
    organizerSharePaise: { type: DataTypes.INTEGER, allowNull: true },
    settlementStatus: { type: DataTypes.STRING(16), allowNull: true },
    settledAt: { type: DataTypes.DATE, allowNull: true },
    settlementReference: { type: DataTypes.STRING, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'payments', underscored: true },
);
