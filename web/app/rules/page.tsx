import { RulesEditor } from '@/components/RulesEditor';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rules' };

export default async function RulesPage() {
  const { engine, services } = await tea();
  const { data } = await services.workspace.read();
  const rows = engine.rulesView(services.catalog, data.rules);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Rules</h1>
          <p className="help">
            Every check TEA runs, for all projects. Turn checks off, change how serious they are, or tune thresholds. Saved in the <code>rules</code> section of the config file.
          </p>
        </div>
      </div>
      <RulesEditor rows={rows} />
    </>
  );
}
