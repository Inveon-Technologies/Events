import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

// An Inveon employee who runs the super admin portal. Kept apart from
// organizer `users` on purpose: a different login, a stricter password
// rule, an emailed second factor, and nothing an organizer can reach.
export class PlatformAdmin extends Model<InferAttributes<PlatformAdmin>, InferCreationAttributes<PlatformAdmin>> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare name: string;
  declare passwordHash: string;
  declare active: CreationOptional<boolean>;
  declare failedAttempts: CreationOptional<number>;
  declare lockedUntil: CreationOptional<Date | null>;
  declare lastLoginAt: CreationOptional<Date | null>;
  declare lastLoginIp: CreationOptional<string | null>;
  declare passwordChangedAt: CreationOptional<Date | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

PlatformAdmin.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    failedAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lockedUntil: { type: DataTypes.DATE, allowNull: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    lastLoginIp: { type: DataTypes.STRING, allowNull: true },
    passwordChangedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'platform_admins', underscored: true },
);
