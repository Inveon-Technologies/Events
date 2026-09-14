import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export class TicketCategory extends Model<InferAttributes<TicketCategory>, InferCreationAttributes<TicketCategory>> {
  declare id: CreationOptional<string>;
  declare eventId: string;
  declare name: string;
  declare description: string | null;
  declare pricePaise: number;
  declare maxPerBooking: CreationOptional<number>;
  declare quotaTotal: number;
  // See the migration's comment: this is a denormalized counter for
  // fast reads, not the source of truth for oversell prevention.
  declare quotaRemaining: number;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

TicketCategory.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    eventId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    pricePaise: { type: DataTypes.INTEGER, allowNull: false },
    maxPerBooking: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
    quotaTotal: { type: DataTypes.INTEGER, allowNull: false },
    quotaRemaining: { type: DataTypes.INTEGER, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'ticket_categories', underscored: true },
);
