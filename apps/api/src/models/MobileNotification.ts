import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';
import type { MobileApp } from './MobileDevice';

// The mobile apps' in-app inbox. Every push is stored here first, so a
// notification is still listed when the push itself never arrived
// (notifications turned off, app uninstalled and reinstalled, FCM down).
export class MobileNotification extends Model<InferAttributes<MobileNotification>, InferCreationAttributes<MobileNotification>> {
  declare id: CreationOptional<number>;
  declare app: MobileApp;
  declare customerEmail: string | null;
  declare organizerId: string | null;
  declare kind: string;
  declare title: string;
  declare body: string;
  declare data: Record<string, string> | null;
  declare readAt: Date | null;
  declare readonly createdAt: CreationOptional<Date>;
}

MobileNotification.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    app: { type: DataTypes.STRING(16), allowNull: false },
    customerEmail: { type: DataTypes.STRING, allowNull: true },
    organizerId: { type: DataTypes.UUID, allowNull: true },
    kind: { type: DataTypes.STRING(40), allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    body: { type: DataTypes.STRING(1000), allowNull: false },
    data: { type: DataTypes.JSONB, allowNull: true },
    readAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'mobile_notifications', underscored: true, updatedAt: false },
);
