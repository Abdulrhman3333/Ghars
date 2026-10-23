import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { toArabicDigits } from '@/lib/utils';

  type TreeRow = {
    user_id: string;
    name: string | null;
    user_code: string;
    certifier_id: string;
    juz_number: number;
    depth: number;
    certified_at: string | null;
  };

type TreeNode = { userId: string; name: string; code: string; juz: number[] };

export default async function StatsPage() {
  const me = await getCurrentProfile();
  const supabase = await createClient();

  const { count: directCount } = await supabase
    .from('exams')
    .select('id', { count: 'exact', head: true })
    .eq('nominated_by', me.id)
    .eq('state', 'completed')
    .eq('result', 'pass');

  const { data: treeRows } = await supabase.rpc('get_lineage_tree');
  const rows = (treeRows ?? []) as TreeRow[];

  // certifier → (student → juz list): one node per student under each certifier
  const childrenOf = new Map<string, Map<string, TreeNode>>();
  for (const r of rows) {
    const group = childrenOf.get(r.certifier_id) ?? new Map<string, TreeNode>();
    const node = group.get(r.user_id) ?? { userId: r.user_id, name: r.name ?? '', code: r.user_code, juz: [] };
    node.juz.push(r.juz_number);
    group.set(r.user_id, node);
    childrenOf.set(r.certifier_id, group);
  }
  const descendants = new Set(rows.map((r) => r.user_id)).size;

  const { data: frequent } = await supabase.rpc('get_frequent_errors');
  const { data: types } = await supabase.from('error_types').select('id, name_ar, color_hex');
  const { data: subtypes } = await supabase.from('error_subtypes').select('id, name_ar');
  const typeName = new Map((types ?? []).map((t) => [t.id, t]));
  const subtypeName = new Map((subtypes ?? []).map((s) => [s.id, s.name_ar]));

  const { data: repeats } = await supabase
    .from('v_error_repeat_counts')
    .select('location, error_type_id, repeat_count')
    .eq('reciter_id', me.id)
    .gt('repeat_count', 1)
    .order('repeat_count', { ascending: false })
    .limit(20);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.stats.title}</h1>
        <p className="text-sm text-ink/70">{ar.stats.subtitle}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Metric label={ar.stats.certifiedDirect} value={directCount ?? 0} />
        <Metric label={ar.stats.descendants} value={descendants} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold text-gold-dark">{ar.stats.tree}</h2>
        {childrenOf.has(me.id) ? (
          <Tree parentId={me.id} childrenOf={childrenOf} depth={0} />
        ) : (
          <p className="text-sm text-ink/60">{ar.stats.treeEmpty}</p>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold text-gold-dark">{ar.stats.frequent}</h2>
        {!frequent || frequent.length === 0 ? (
          <p className="text-sm text-ink/60">{ar.stats.frequentEmpty}</p>
        ) : (
          <ul className="divide-y divide-sand">
            {frequent.map((f: { error_type_id: number; subtype_id: number | null; total: number }, i: number) => {
              const t = typeName.get(f.error_type_id);
              return (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="block h-3 w-3 rounded-full" style={{ background: t?.color_hex }} />
                    {t?.name_ar}
                    {f.subtype_id && <span className="text-ink/60">· {subtypeName.get(f.subtype_id)}</span>}
                  </span>
                  <span className="font-bold">{toArabicDigits(f.total)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold text-gold-dark">{ar.stats.repeats}</h2>
        {!repeats || repeats.length === 0 ? (
          <p className="text-sm text-ink/60">{ar.stats.repeatsEmpty}</p>
        ) : (
          <ul className="divide-y divide-sand">
            {repeats.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm" dir="ltr">
                <span className="font-mono">{r.location}</span>
                <span className="font-bold">
                  {toArabicDigits(r.repeat_count)} {ar.stats.times}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card text-center">
      <p className="text-xs font-bold text-gold-dark">{label}</p>
      <p className="mt-1 text-3xl font-bold text-ink">{toArabicDigits(value)}</p>
    </div>
  );
}

function Tree({
  parentId,
  childrenOf,
  depth,
}: {
  parentId: string;
  childrenOf: Map<string, Map<string, TreeNode>>;
  depth: number;
}) {
  const nodes = [...(childrenOf.get(parentId)?.values() ?? [])];
  return (
    <ul className={depth === 0 ? 'space-y-2' : 'mt-2 space-y-2 border-s-2 border-sand ps-4'}>
      {nodes.map((n) => (
        <li key={n.userId}>
          <details open={depth < 2}>
            <summary className="cursor-pointer text-sm font-bold text-ink">
              {n.name && <>{n.name}<span className="ms-2 font-mono text-xs text-ink/60" dir="ltr">{toArabicDigits(n.code)}</span></>}
              {!n.name && <span dir="ltr">{toArabicDigits(n.code)}</span>}
              <span className="ms-2 text-xs text-gold-dark">
                ({ar.students.juz} {n.juz.map((j) => toArabicDigits(j)).join('، ')})
              </span>
            </summary>
            <Tree parentId={n.userId} childrenOf={childrenOf} depth={depth + 1} />
          </details>
        </li>
      ))}
    </ul>
  );
}
