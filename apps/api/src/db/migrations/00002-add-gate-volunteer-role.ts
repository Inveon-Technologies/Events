import { QueryInterface } from 'sequelize';

// The initial schema (00001) only included platform_admin, organizer_owner,
// and organizer_staff — but BE-04's own task description calls for a
// distinct gate-volunteer role. Business doc §30 lists *restricted,
// scan-only* volunteer accounts as future scope, but the role itself is
// needed now for BE-04's JWT auth to have something to issue.
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.sequelize.query("ALTER TYPE enum_users_role ADD VALUE 'gate_volunteer';");
}

export async function down() {
  // Postgres can't drop a single enum value without rebuilding the type
  // (dropping/recreating it, which would fail if any row uses the value).
  // Since this is purely additive and no other migration depends on the
  // value being absent, treat down() as a no-op rather than risk data loss.
}
