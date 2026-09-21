import { Badge, Notice, type BadgeTone } from '@/components/ui';
import type { FestPhase } from '@/lib/fests';

/** Pieces shared by the fest list and the fest screen. */

const PHASES: Record<FestPhase, { tone: BadgeTone; label: string }> = {
  live: { tone: 'good', label: 'Live now' },
  upcoming: { tone: 'info', label: 'Upcoming' },
  ended: { tone: 'quiet', label: 'Ended' },
  cancelled: { tone: 'bad', label: 'Cancelled' },
};

export function PhaseBadge({ phase }: { phase: FestPhase }) {
  return <Badge tone={PHASES[phase].tone}>{PHASES[phase].label}</Badge>;
}

export function MigrationNotice() {
  return (
    <Notice tone="warn" title="One step left: create the fest tables">
      This screen needs four new tables that are not in the database yet. Open the Supabase SQL
      editor, paste the contents of{' '}
      <code className="font-mono text-xs">supabase/migrations/0109_campus_fests.sql</code> and run
      it. It only adds tables — nothing that already exists is changed — and it is safe to run
      twice. Then reload this page.
    </Notice>
  );
}
