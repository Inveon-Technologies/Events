import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export class PlatformSetting extends Model<InferAttributes<PlatformSetting>, InferCreationAttributes<PlatformSetting>> {
  declare key: string;
  declare value: unknown;
  declare updatedBy: string | null;
  declare readonly updatedAt: CreationOptional<Date>;
}

PlatformSetting.init(
  {
    key: { type: DataTypes.STRING(80), primaryKey: true },
    value: { type: DataTypes.JSONB, allowNull: false },
    updatedBy: { type: DataTypes.STRING, allowNull: true },
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'platform_settings', underscored: true, createdAt: false },
);
