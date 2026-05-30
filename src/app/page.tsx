import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { normalizeLanguageCode } from '@/lib/languages';

export default async function Home() {
  const session = await auth();
  if (session?.user?.email) {
    const target = normalizeLanguageCode(
      (session.user as { targetLanguage?: string }).targetLanguage ?? 'th',
    );
    redirect(`/language/${target}/vocab`);
  }
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6">
      <h1 className="text-4xl font-bold tracking-tight">Language Learning Bot</h1>
      <p className="max-w-md text-muted-foreground">
        Study your own curated Thai vocab with spaced repetition and an AI tutor that knows what
        you already know.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/signup">Sign up</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    </main>
  );
}
