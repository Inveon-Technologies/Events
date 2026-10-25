import { useEffect, useState } from 'react';
import { Button, Card, Field, Loading, Notice, PageHeader } from '../ui';
import { inputClass, useSa, useSaAction } from '../lib';

type AppKey = 'customer' | 'organizer';

interface Release {
  latestVersion: string;
  minVersion: string;
  androidStoreUrl: string | null;
  iosStoreUrl: string | null;
  releaseNotes: string[];
}

interface MobileAppsData {
  apps: Record<AppKey, Release>;
  pushConfigured: boolean;
}

const TITLES: Record<AppKey, string> = {
  customer: 'Customer app (Inveon Events)',
  organizer: 'Organizer app (Inveon Organizer)',
};

function ReleaseCard({ app, release, onSaved }: { app: AppKey; release: Release; onSaved: (d: MobileAppsData) => void }) {
  const [draft, setDraft] = useState({ ...release, notes: release.releaseNotes.join('\n') });
  const save = useSaAction();
  const announce = useSaAction();
  useEffect(() => setDraft({ ...release, notes: release.releaseNotes.join('\n') }), [release]);

  async function submit() {
    const res = await save.run<MobileAppsData>(
      `/mobile-apps/${app}`,
      {
        method: 'PUT',
        body: {
          latestVersion: draft.latestVersion,
          minVersion: draft.minVersion,
          androidStoreUrl: draft.androidStoreUrl ?? '',
          iosStoreUrl: draft.iosStoreUrl ?? '',
          releaseNotes: draft.notes,
        },
      },
      'Saved. Apps older than the latest version will show the update prompt on their next launch.',
    );
    if (res) onSaved(res);
  }

  async function notify() {
    const res = await announce.run<{ devices: number; sent: number; pushConfigured: boolean }>(`/mobile-apps/${app}/announce`);
    if (res) {
      announce.setMessage({
        kind: res.pushConfigured ? 'ok' : 'error',
        text: res.pushConfigured
          ? `Sent to ${res.sent} of ${res.devices} devices on an older version.`
          : 'Push is not set up. Add the Firebase keys under Integrations first.',
      });
    }
  }

  const set = (key: keyof typeof draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <Card title={TITLES[app]}>
      <div className="space-y-3">
        <Notice message={save.message ?? announce.message} />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Latest version" hint="The version in the store now. Older installs see “Update available”.">
            <input className={inputClass} value={draft.latestVersion} onChange={set('latestVersion')} placeholder="1.2.0" />
          </Field>
          <Field label="Minimum version" hint="Installs older than this must update before they can continue.">
            <input className={inputClass} value={draft.minVersion} onChange={set('minVersion')} placeholder="1.0.0" />
          </Field>
          <Field label="Play Store link">
            <input
              className={inputClass}
              value={draft.androidStoreUrl ?? ''}
              onChange={set('androidStoreUrl')}
              placeholder="https://play.google.com/store/apps/details?id=…"
            />
          </Field>
          <Field label="App Store link">
            <input
              className={inputClass}
              value={draft.iosStoreUrl ?? ''}
              onChange={set('iosStoreUrl')}
              placeholder="https://apps.apple.com/app/…"
            />
          </Field>
        </div>
        <Field label="What's new" hint="One line per feature, shown in the update prompt (up to 10).">
          <textarea className={inputClass} rows={4} value={draft.notes} onChange={set('notes')} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button disabled={save.busy} onClick={submit}>
            Save release
          </Button>
          <Button tone="secondary" disabled={announce.busy} onClick={notify}>
            Push “update available” to older installs
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function MobileAppsPage() {
  const { data, error, loading, setData } = useSa<MobileAppsData>('/mobile-apps');
  return (
    <div className="space-y-4">
      <PageHeader
        title="Mobile apps"
        subtitle="After publishing a new version to the stores, set it as the latest here. Users on an older version get an in-app update prompt, and you can send them a push too."
      />
      <Loading error={error} loading={loading && !data} />
      {data && !data.pushConfigured && (
        <Notice
          message={{
            kind: 'error',
            text: 'Push notifications are off: add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY under Integrations.',
          }}
        />
      )}
      {data &&
        (['customer', 'organizer'] as AppKey[]).map((app) => (
          <ReleaseCard key={app} app={app} release={data.apps[app]} onSaved={setData} />
        ))}
    </div>
  );
}
