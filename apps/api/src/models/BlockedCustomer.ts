import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export class BlockedCustomer extends Model<InferAttributes<BlockedCustomer>, InferCreationAttributes<BlockedCustomer>> {
  declare email: string; // lower-case
  declare reason: string | null;
  declare blockedBy: string | null;
  declare readonly createdAt: CreationOptional<Date>;
}

BlockedCustomer.init(
  {
    email: { type: DataTypes.STRING, primaryKey: true },
    reason: { type: DataTypes.STRING(500), allowNull: true },
    blockedBy: { type: DataTypes.STRING, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'blocked_customers', underscored: true, updatedAt: false },
);
