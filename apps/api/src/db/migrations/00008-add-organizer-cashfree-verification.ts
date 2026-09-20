import { QueryInterface, DataTypes } from 'sequelize';

// Only the minimum kept locally for display and for building Cashfree
// API requests — the full bank account number is never stored here.
// Cashfree's vendor record is the system of record for it once
// registered; this table only keeps a last-4 for the organizer's own
// "which account did I register" display, plus enough KYC identifiers
// (PAN) to resubmit if a vendor registration needs retrying.
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('organizers', 'pan_number', { type: DataTypes.STRING, allowNull: true });
  await qi.addColumn('organizers', 'kyc_account_type', { type: DataTypes.STRING, allowNull: true });
  await qi.addColumn('organizers', 'business_type', { type: DataTypes.STRING, allowNull: true });
  await qi.addColumn('organizers', 'bank_account_holder_name', { type: DataTypes.STRING, allowNull: true });
  await qi.addColumn('organizers', 'bank_account_number_last4', { type: DataTypes.STRING(4), allowNull: true });
  await qi.addColumn('organizers', 'bank_ifsc', { type: DataTypes.STRING, allowNull: true });
  await qi.addColumn('organizers', 'cashfree_vendor_id', { type: DataTypes.STRING, allowNull: true, unique: true });
  // not_started | in_bene_creation | active | blocked | deleted — mirrors
  // Cashfree's own vendor status values (lowercased/snake_cased to match
  // this schema's enum convention elsewhere) rather than inventing a
  // parallel set of states that would need manual translation every time
  // Cashfree's status is read.
  await qi.addColumn('organizers', 'cashfree_vendor_status', {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'not_started',
  });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('organizers', 'cashfree_vendor_status');
  await qi.removeColumn('organizers', 'cashfree_vendor_id');
  await qi.removeColumn('organizers', 'bank_ifsc');
  await qi.removeColumn('organizers', 'bank_account_number_last4');
  await qi.removeColumn('organizers', 'bank_account_holder_name');
  await qi.removeColumn('organizers', 'business_type');
  await qi.removeColumn('organizers', 'kyc_account_type');
  await qi.removeColumn('organizers', 'pan_number');
}
