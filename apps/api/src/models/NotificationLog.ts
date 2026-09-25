import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export type NotificationChannel = 'email' | 'whatsapp' | 'otp';
export type NotificationStatus = 'sent' | 'failed' | 'skipped' | 'issued' | 'verified' | 'wrong' | 'expired' | 'locked';

export class NotificationLog extends Model<InferAttributes<NotificationLog>, InferCreationAttributes<NotificationLog>> {
  declare id: CreationOptional<number>;
  declare channel: NotificationChannel;
  declare kind: string | null;
  declare recipient: string;
  declare subject: string | null;
  declare status: NotificationStatus;
  declare error: string | null;
  declare reference: string | null;
  declare readonly createdAt: CreationOptional<Date>;
}

NotificationLog.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    channel: { type: DataTypes.STRING(16), allowNull: false },
    kind: { type: DataTypes.STRING(60), allowNull: true },
    recipient: { type: DataTypes.STRING, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false },
    error: { type: DataTypes.TEXT, allowNull: true },
    reference: { type: DataTypes.STRING, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'notification_logs', underscored: true, updatedAt: false },
);
