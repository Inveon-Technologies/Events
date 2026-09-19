import { QueryInterface, DataTypes } from 'sequelize';

// Two additions, both needed for real organizer signup:
// - email_verified: defaults to true deliberately — every existing user
//   (seed data, anyone created any other way) is unaffected and can still
//   log in exactly as before. Only the new POST /api/auth/signup
//   explicitly sets this false on creation, flipping it true once the
//   OTP is verified. Login checks this column and rejects unverified
//   accounts (see routes/auth.ts).
// - name: the signed-up person's own name (distinct from the
//   organization's name, which lives on Organizer) — nowhere to put this
//   before now. Nullable: existing users were never asked for one.
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('users', 'email_verified', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });
  await qi.addColumn('users', 'name', {
    type: DataTypes.STRING,
    allowNull: true,
  });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('users', 'email_verified');
  await qi.removeColumn('users', 'name');
}
