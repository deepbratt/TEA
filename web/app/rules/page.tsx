import { CustomRulesEditor } from '@/components/CustomRulesEditor';
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
            What TEA checks in every project. Pick a quick setup, switch checks on or off, or add rules of your own. Everything is free and open source,
            and it&apos;s all saved in the config file.
          </p>
        </div>
      </div>
      <div className="stack-l">
        <CustomRulesEditor initial={data.customRules} templates={engine.CUSTOM_RULE_TEMPLATES} />
        <RulesEditor rows={rows} />
      </div>
    </>
  );
}
