import ar from '@/messages/ar.json';
import { acceptInvite } from '@/lib/actions/students';
import { getCurrentProfile } from '@/lib/auth';

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  await getCurrentProfile();

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold text-gold-dark">{ar.invite.title}</h1>
      <p className="card text-sm leading-loose text-ink/80">{ar.invite.desc}</p>
      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-danger">{ar.invite.failed}</p>}
      <form action={acceptInvite}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn-primary w-full">{ar.invite.accept}</button>
      </form>
    </div>
  );
}
