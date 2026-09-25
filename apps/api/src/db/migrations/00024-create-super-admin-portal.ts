import { QueryInterface, DataTypes } from 'sequelize';

// The Inveon super admin portal: its own accounts (separate from
// organizer users), an audit trail of every admin action, platform-wide
// settings (branding, invoice, certificate footer, integrations), a log
// of every email / WhatsApp / one-time code sent, and blocking for
// organizers, their users and customers.
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.createTable('platform_admins', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    password_hash: { type: DataTypes.STRING, allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    failed_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    locked_until: { type: DataTypes.DATE, allowNull: true },
    last_login_at: { type: DataTypes.DATE, allowNull: true },
    last_login_ip: { type: DataTypes.STRING, allowNull: true },
    password_changed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await qi.createTable('admin_audit_logs', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    admin_id: { type: DataTypes.UUID, allowNull: true },
    admin_email: { type: DataTypes.STRING, allowNull: true },
    action: { type: DataTypes.STRING(80), allowNull: false },
    target: { type: DataTypes.STRING, allowNull: true },
    details: { type: DataTypes.JSONB, allowNull: true },
    ip: { type: DataTypes.STRING, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.addIndex('admin_audit_logs', ['created_at']);

  await qi.createTable('platform_settings', {
    key: { type: DataTypes.STRING(80), primaryKey: true },
    value: { type: DataTypes.JSONB, allowNull: false },
    updated_by: { type: DataTypes.STRING, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  // Every outgoing email / WhatsApp message and every one-time code,
  // with its delivery status — never the code or message body itself.
  await qi.createTable('notification_logs', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    channel: { type: DataTypes.STRING(16), allowNull: false }, // email | whatsapp | otp
    kind: { type: DataTypes.STRING(60), allowNull: true },
    recipient: { type: DataTypes.STRING, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false }, // sent | failed | issued | verified | wrong | expired | skipped
    error: { type: DataTypes.TEXT, allowNull: true },
    reference: { type: DataTypes.STRING, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.addIndex('notification_logs', ['created_at']);
  await qi.addIndex('notification_logs', ['channel', 'created_at']);

  await qi.addColumn('organizers', 'blocked_at', { type: DataTypes.DATE, allowNull: true });
  await qi.addColumn('organizers', 'blocked_reason', { type: DataTypes.STRING(500), allowNull: true });
  await qi.addColumn('users', 'blocked_at', { type: DataTypes.DATE, allowNull: true });
  await qi.addColumn('users', 'blocked_reason', { type: DataTypes.STRING(500), allowNull: true });

  await qi.createTable('blocked_customers', {
    email: { type: DataTypes.STRING, primaryKey: true }, // stored lower-case
    reason: { type: DataTypes.STRING(500), allowNull: true },
    blocked_by: { type: DataTypes.STRING, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
  });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.dropTable('blocked_customers');
  await qi.removeColumn('users', 'blocked_reason');
  await qi.removeColumn('users', 'blocked_at');
  await qi.removeColumn('organizers', 'blocked_reason');
  await qi.removeColumn('organizers', 'blocked_at');
  await qi.dropTable('notification_logs');
  await qi.dropTable('platform_settings');
  await qi.dropTable('admin_audit_logs');
  await qi.dropTable('platform_admins');
}
