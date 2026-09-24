import { QueryInterface, DataTypes } from 'sequelize';

// Claim marker for the next-day "thank you + photos" email (#57): set
// with a conditional UPDATE before sending, so it goes out once per
// event however many API processes run the job.
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('events', 'post_event_email_sent_at', { type: DataTypes.DATE, allowNull: true });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('events', 'post_event_email_sent_at');
}
