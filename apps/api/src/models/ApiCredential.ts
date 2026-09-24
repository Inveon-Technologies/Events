import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export class ApiCredential extends Model<InferAttributes<ApiCredential>, InferCreationAttributes<ApiCredential>> {
  declare id: CreationOptional<string>;
  declare organizerId: string;
  declare name: string;
  declare appKey: string;
  declare secretHash: string;
  declare secretLast4: string;
  declare createdByUserId: string | null;
  declare lastUsedAt: CreationOptional<Date | null>;
  declare revokedAt: CreationOptional<Date | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

ApiCredential.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizerId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    appKey: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    secretHash: { type: DataTypes.STRING(64), allowNull: false },
    secretLast4: { type: DataTypes.STRING(4), allowNull: false },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
    lastUsedAt: { type: DataTypes.DATE, allowNull: true },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'api_credentials', underscored: true },
);
