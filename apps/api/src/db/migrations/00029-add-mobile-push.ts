import { QueryInterface, DataTypes } from 'sequelize';

// The Flutter apps (customer + organizer). Each install registers its
// Firebase Cloud Messaging token; signing in links it to the customer's
// email or the organizer user. mobile_notifications is the in-app
// inbox: every push sent is also stored, so the app can list them.
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.createTable('mobile_devices', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    // customer | organizer
    app: { type: DataTypes.STRING(16), allowNull: false },
    // android | ios
    platform: { type: DataTypes.STRING(16), allowNull: false },
    fcm_token: { type: DataTypes.STRING(512), allowNull: false, unique: true },
    app_version: { type: DataTypes.STRING(32), allowNull: true },
    customer_email: { type: DataTypes.STRING, allowNull: true },
    user_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    organizer_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'organizers', key: 'id' }, onDelete: 'SET NULL' },
    last_seen_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('mobile_devices', ['app', 'customer_email']);
  await qi.addIndex('mobile_devices', ['app', 'organizer_id']);

  await qi.createTable('mobile_notifications', {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    app: { type: DataTypes.STRING(16), allowNull: false },
    customer_email: { type: DataTypes.STRING, allowNull: true },
    organizer_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'organizers', key: 'id' }, onDelete: 'CASCADE' },
    // booking_confirmed | booking_cancelled | event_reminder | new_booking | app_update | ...
    kind: { type: DataTypes.STRING(40), allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    body: { type: DataTypes.STRING(1000), allowNull: false },
    // Small key/value payload the app uses to open the right screen.
    data: { type: DataTypes.JSONB, allowNull: true },
    read_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('mobile_notifications', ['app', 'customer_email', 'created_at']);
  await qi.addIndex('mobile_notifications', ['app', 'organizer_id', 'created_at']);
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.dropTable('mobile_notifications');
  await qi.dropTable('mobile_devices');
}
