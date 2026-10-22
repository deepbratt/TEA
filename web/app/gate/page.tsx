import { live } from '@/lib/live';
import { GateEditor } from '@/components/GateEditor';
import { tea } from '@/lib/tea';

export const metadata = { title: 'Quality gate' };

export default async function GatePage() {
  await live();
  const { engine, services } = await tea();
  const { data } = await services.workspace.read();
  const label = (m: string) =>
    m === 'score' ? 'TEA Score' : m === 'issues' ? 'Issues (all)' : m in engine.AREA_LABEL ? `${engine.AREA_LABEL[m as keyof typeof engine.AREA_LABEL]} score` : `${m[0]!.toUpperCase()}${m.slice(1)} issues`;
  const metrics = engine.GATE_METRICS.map((id) => ({ id, label: label(id) }));
  return (
    <div className="narrow">
      <div className="page-head">
        <div>
          <h1>Quality gate</h1>
          <p className="help">
            After each analysis TEA checks the results against these conditions and marks the project Passed or Failed. In CI, <code>tea-qa run</code> exits
            with an error when the gate fails. Saved in the <code>gate</code> section of the config file.
          </p>
        </div>
      </div>
      <GateEditor initial={data.gate.conditions} metrics={metrics} />
    </div>
  );
}
