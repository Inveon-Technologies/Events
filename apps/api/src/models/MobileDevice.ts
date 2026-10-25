import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export type MobileApp = 'customer' | 'organizer';
export type MobilePlatform = 'android' | 'ios';

// One installed copy of a mobile app and its push (FCM) token.
export class MobileDevice extends Model<InferAttributes<MobileDevice>, InferCreationAttributes<MobileDevice>> {
  declare id: CreationOptional<string>;
  declare app: MobileApp;
  declare platform: MobilePlatform;
  declare fcmToken: string;
  declare appVersion: string | null;
  // Set while a customer is signed in (customer app).
  declare customerEmail: string | null;
  // Set while an organizer user is signed in (organizer app).
  declare userId: string | null;
  declare organizerId: string | null;
  declare lastSeenAt: CreationOptional<Date>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

MobileDevice.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    app: { type: DataTypes.STRING(16), allowNull: false },
    platform: { type: DataTypes.STRING(16), allowNull: false },
    fcmToken: { type: DataTypes.STRING(512), allowNull: false, unique: true },
    appVersion: { type: DataTypes.STRING(32), allowNull: true },
    customerEmail: { type: DataTypes.STRING, allowNull: true },
    userId: { type: DataTypes.UUID, allowNull: true },
    organizerId: { type: DataTypes.UUID, allowNull: true },
    lastSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'mobile_devices', underscored: true },
);
