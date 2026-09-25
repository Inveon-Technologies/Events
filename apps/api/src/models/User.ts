import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export type UserRole = 'platform_admin' | 'organizer_owner' | 'organizer_staff' | 'gate_volunteer';

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare organizerId: string | null;
  declare email: string;
  declare passwordHash: string;
  declare role: UserRole;
  declare emailVerified: CreationOptional<boolean>;
  declare name: string | null;
  declare blockedAt: CreationOptional<Date | null>;
  declare blockedReason: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

User.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizerId: { type: DataTypes.UUID, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM('platform_admin', 'organizer_owner', 'organizer_staff', 'gate_volunteer'), allowNull: false },
    emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    name: { type: DataTypes.STRING, allowNull: true },
    blockedAt: { type: DataTypes.DATE, allowNull: true },
    blockedReason: { type: DataTypes.STRING(500), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'users', underscored: true },
);
