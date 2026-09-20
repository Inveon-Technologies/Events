import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/connection';

export type EventMediaType = 'photo' | 'video';

export class EventMedia extends Model<InferAttributes<EventMedia>, InferCreationAttributes<EventMedia>> {
  declare id: CreationOptional<string>;
  declare eventId: string;
  declare mediaType: EventMediaType;
  declare url: string;
  declare readonly createdAt: CreationOptional<Date>;
}

// No updatedAt — the underlying table (see migration 00001) only has
// created_at, matching every other append-only, never-edited-in-place
// table in this schema (an upload is replaced by deleting and
// re-uploading, not patched).
EventMedia.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    eventId: { type: DataTypes.UUID, allowNull: false },
    mediaType: { type: DataTypes.ENUM('photo', 'video'), allowNull: false },
    url: { type: DataTypes.STRING, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'event_media', underscored: true, updatedAt: false },
);
