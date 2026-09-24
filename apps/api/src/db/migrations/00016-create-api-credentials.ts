import { QueryInterface, DataTypes } from 'sequelize';

// App key + secret pairs an organizer creates (Settings → Integrations)
// so their own website/app can read their events through /api/v1.
// Only a SHA-256 hash of the secret is stored — it's shown once, at
// creation, and can't be recovered afterwards (only revoked/replaced).
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.createTable('api_credentials', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizer_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizers', key: 'id' },
      onDelete: 'CASCADE',
    },
    name: { type: DataTypes.STRING(100), allowNull: false },
    app_key: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    secret_hash: { type: DataTypes.STRING(64), allowNull: false },
    secret_last4: { type: DataTypes.STRING(4), allowNull: false },
    created_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    last_used_at: { type: DataTypes.DATE, allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await qi.addIndex('api_credentials', ['organizer_id']);
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.dropTable('api_credentials');
}
