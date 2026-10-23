export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-danger">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-success">
        {success}
      </p>
    );
  }
  return null;
}
