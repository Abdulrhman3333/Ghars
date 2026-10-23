import { notFound } from 'next/navigation';
import ar from '@/messages/ar.json';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { toArabicDigits } from '@/lib/utils';
import { AutoRefresh } from './auto-refresh';
import { MessageForm } from './message-form';

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(rawId)) notFound();

  const me = await getCurrentProfile();
  const supabase = await createClient();

  // chat is only open between a learner and their assigned teacher (progress link)
  const { data: allowed } = await supabase.rpc('can_chat_with', { p_user: rawId });
  if (!allowed) notFound();
  if (rawId === me.id) notFound();

  const [partnerRes, msgsRes] = await Promise.all([
    supabase.from('users').select('id, user_code').eq('id', rawId).single(),
    supabase
      .from('chat_messages')
      .select('id, sender_id, recipient_id, body, read_at, created_at')
      .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
      .order('created_at', { ascending: true })
      .limit(300)
      .returns<Message[]>(),
  ]);
  const partner = partnerRes.data;
  if (!partner) notFound();
  const all = msgsRes.data ?? [];
  const messages = all.filter(
    (m) => (m.sender_id === me.id && m.recipient_id === rawId) || (m.sender_id === rawId && m.recipient_id === me.id),
  );

  // reading receipt: the other side sees when their latest message has been read
  await supabase
    .from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', me.id)
    .eq('sender_id', rawId)
    .is('read_at', null);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gold-dark" dir="ltr">
          {toArabicDigits(partner.user_code)}
        </h1>
        <p className="text-sm text-ink/70">{ar.chat.threadHint}</p>
      </header>

      <ul className="card flex max-h-[55dvh] flex-col gap-1 overflow-y-auto">
        {messages.length === 0 && <p className="p-2 text-sm text-ink/60">{ar.chat.emptyThread}</p>}
        {messages.map((m) => {
          const mine = m.sender_id === me.id;
          return (
            <li
              key={m.id}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-6 ${
                mine ? 'self-end bg-amber-brand/15 text-ink' : 'self-start bg-parchment text-ink'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className="mt-0.5 text-[10px] text-ink/50">
                {m.read_at ? ar.chat.read : ''}
              </p>
            </li>
          );
        })}
      </ul>

      <MessageForm partnerId={rawId} />
      <AutoRefresh />
    </div>
  );
}
