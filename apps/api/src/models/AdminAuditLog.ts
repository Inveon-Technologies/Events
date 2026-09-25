import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export class AdminAuditLog extends Model<InferAttributes<AdminAuditLog>, InferCreationAttributes<AdminAuditLog>> {
  declare id: CreationOptional<number>;
  declare adminId: string | null;
  declare adminEmail: string | null;
  declare action: string;
  declare target: string | null;
  declare details: Record<string, unknown> | null;
  declare ip: string | null;
  declare readonly createdAt: CreationOptional<Date>;
}

AdminAuditLog.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    adminId: { type: DataTypes.UUID, allowNull: true },
    adminEmail: { type: DataTypes.STRING, allowNull: true },
    action: { type: DataTypes.STRING(80), allowNull: false },
    target: { type: DataTypes.STRING, allowNull: true },
    details: { type: DataTypes.JSONB, allowNull: true },
    ip: { type: DataTypes.STRING, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'admin_audit_logs', underscored: true, updatedAt: false },
);
