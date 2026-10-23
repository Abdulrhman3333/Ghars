import Link from 'next/link';
import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { startChatByCode } from '@/lib/actions/chat';
import { formatArabicTime, toArabicDigits } from '@/lib/utils';
import { FormMessage } from '@/components/form-feedback';

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

const ERRORS: Record<string, string> = {
  notfound: ar.chat.errors.notfound,
  self: ar.chat.errors.self,
  notallowed: ar.chat.errors.notallowed,
};

export default async function ChatIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const me = await getCurrentProfile();
  const supabase = await createClient();

  // RLS returns only my messages; group them into one thread per partner
  const [mineRes, unreadRes] = await Promise.all([
    supabase
      .from('chat_messages')
      .select('id, sender_id, recipient_id, body, read_at, created_at')
      .order('created_at', { ascending: true })
      .limit(500)
      .returns<Message[]>(),
    supabase
      .from('chat_messages')
      .select('id, sender_id', { count: 'exact' })
      .eq('recipient_id', me.id)
      .is('read_at', null),
  ]);
  const messages = mineRes.data ?? [];

  const lastByPartner = new Map<string, Message>();
  for (const m of messages) {
    const partner = m.sender_id === me.id ? m.recipient_id : m.sender_id;
    lastByPartner.set(partner, m);
  }

  const partnerIds = [...lastByPartner.keys()];
  const { data: partners } = partnerIds.length
    ? await supabase.from('users').select('id, user_code').in('id', partnerIds)
    : { data: [] as { id: string; user_code: string }[] };
  const codeOf = new Map((partners ?? []).map((p) => [p.id, p.user_code]));

  const unread = unreadRes.count ?? 0;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark">{ar.chat.title}</h1>
        <p className="text-sm text-ink/70">{ar.chat.subtitle}</p>
      </header>

      {error && <FormMessage error={ERRORS[error] ?? ar.common.unexpected} />}

      <section className="card space-y-3">
        <h2 className="font-bold text-gold-dark">{ar.chat.startTitle}</h2>
        <p className="text-sm text-ink/70">{ar.chat.startHint}</p>
        <form action={startChatByCode} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="chat-code" className="sr-only">{ar.chat.codeLabel}</label>
          <input
            id="chat-code"
            name="code"
            inputMode="numeric"
            dir="ltr"
            maxLength={6}
            required
            className="field-input sm:max-w-40"
          />
          <button type="submit" className="btn-secondary">{ar.chat.start}</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink/80">{ar.chat.title}</h2>
        {lastByPartner.size === 0 ? (
          <p className="text-sm text-ink/60">{ar.chat.empty}</p>
        ) : (
          <ul className="divide-y divide-sand rounded-xl border border-sand bg-white">
            {[...lastByPartner.entries()].map(([partnerId, last]) => (
              <li key={partnerId} className="px-4 py-3">
                <Link href={`/chat/${partnerId}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-gold-dark" dir="ltr">
                    {toArabicDigits(codeOf.get(partnerId) ?? '')}
                  </span>
                  <span className="text-xs text-ink/60">{formatArabicTime(last.created_at)}</span>
                </Link>
                <Link href={`/chat/${partnerId}`} className="block truncate text-sm text-ink/70">
                  {last.body}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {unread > 0 && (
          <p className="text-xs font-bold text-amber-brand">
            {toArabicDigits(unread)} {ar.chat.unread}
          </p>
        )}
      </section>
    </div>
  );
}
