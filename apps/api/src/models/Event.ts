import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export type EventStatus = 'draft' | 'published' | 'closed' | 'cancelled';

export interface EventScheduleItem {
  time: string;
  title: string;
  description?: string;
}

export interface EventPackingItem {
  item: string;
  mandatory: boolean;
}

export interface EventFaqItem {
  question: string;
  answer: string;
}

export class Event extends Model<InferAttributes<Event>, InferCreationAttributes<Event>> {
  declare id: CreationOptional<string>;
  declare organizerId: string;
  declare name: string;
  declare slug: string | null;
  declare tagline: string | null;
  declare description: string | null;
  declare venueAddress: string | null;
  declare venueMapUrl: string | null;
  declare eventDate: Date;
  declare gateOpenTime: Date | null;
  declare bannerUrl: string | null;
  declare termsAndConditions: string | null;
  declare cancellationPolicy: string | null;
  declare allowSelfServiceCancellation: CreationOptional<boolean>;
  declare refundCutoffDays: number | null;
  declare refundPercentage: number | null;
  declare cancellationReason: string | null;
  declare reminderSentAt: Date | null;
  declare scheduleItems: EventScheduleItem[] | null;
  declare packingChecklist: EventPackingItem[] | null;
  declare faqItems: EventFaqItem[] | null;
  declare status: CreationOptional<EventStatus>;
  declare capacity: number;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

Event.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizerId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, allowNull: true, unique: true },
    tagline: { type: DataTypes.STRING, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    venueAddress: { type: DataTypes.TEXT, allowNull: true },
    venueMapUrl: { type: DataTypes.STRING, allowNull: true },
    eventDate: { type: DataTypes.DATE, allowNull: false },
    gateOpenTime: { type: DataTypes.DATE, allowNull: true },
    bannerUrl: { type: DataTypes.STRING, allowNull: true },
    termsAndConditions: { type: DataTypes.TEXT, allowNull: true },
    cancellationPolicy: { type: DataTypes.TEXT, allowNull: true },
    allowSelfServiceCancellation: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    refundCutoffDays: { type: DataTypes.INTEGER, allowNull: true },
    refundPercentage: { type: DataTypes.INTEGER, allowNull: true },
    cancellationReason: { type: DataTypes.TEXT, allowNull: true },
    reminderSentAt: { type: DataTypes.DATE, allowNull: true },
    scheduleItems: { type: DataTypes.JSONB, allowNull: true },
    packingChecklist: { type: DataTypes.JSONB, allowNull: true },
    faqItems: { type: DataTypes.JSONB, allowNull: true },
    status: { type: DataTypes.ENUM('draft', 'published', 'closed', 'cancelled'), allowNull: false, defaultValue: 'draft' },
    capacity: { type: DataTypes.INTEGER, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'events', underscored: true },
);
