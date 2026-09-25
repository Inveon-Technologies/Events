import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export type CashfreeVendorStatus = 'not_started' | 'in_bene_creation' | 'active' | 'blocked' | 'deleted';
export type KycAccountType = 'individual' | 'business';

export class Organizer extends Model<InferAttributes<Organizer>, InferCreationAttributes<Organizer>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare slug: string;
  declare contactEmail: string | null;
  declare contactPhone: string | null;
  declare logoUrl: string | null;
  declare about: string | null;
  declare gstNumber: string | null;
  declare website: string | null;
  declare panNumber: string | null;
  declare kycAccountType: KycAccountType | null;
  declare businessType: string | null;
  declare bankAccountHolderName: string | null;
  declare bankAccountNumberLast4: string | null;
  declare bankIfsc: string | null;
  declare cashfreeVendorId: string | null;
  declare cashfreeVendorStatus: CreationOptional<CashfreeVendorStatus>;
  declare kycSubmittedAt: Date | null;
  declare blockedAt: CreationOptional<Date | null>;
  declare blockedReason: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

Organizer.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    contactEmail: { type: DataTypes.STRING, allowNull: true },
    contactPhone: { type: DataTypes.STRING, allowNull: true },
    logoUrl: { type: DataTypes.STRING, allowNull: true },
    about: { type: DataTypes.TEXT, allowNull: true },
    gstNumber: { type: DataTypes.STRING, allowNull: true },
    website: { type: DataTypes.STRING, allowNull: true },
    panNumber: { type: DataTypes.STRING, allowNull: true },
    kycAccountType: { type: DataTypes.STRING, allowNull: true },
    businessType: { type: DataTypes.STRING, allowNull: true },
    bankAccountHolderName: { type: DataTypes.STRING, allowNull: true },
    bankAccountNumberLast4: { type: DataTypes.STRING(4), allowNull: true },
    bankIfsc: { type: DataTypes.STRING, allowNull: true },
    cashfreeVendorId: { type: DataTypes.STRING, allowNull: true, unique: true },
    cashfreeVendorStatus: { type: DataTypes.STRING, allowNull: false, defaultValue: 'not_started' },
    kycSubmittedAt: { type: DataTypes.DATE, allowNull: true },
    blockedAt: { type: DataTypes.DATE, allowNull: true },
    blockedReason: { type: DataTypes.STRING(500), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'organizers', underscored: true },
);
