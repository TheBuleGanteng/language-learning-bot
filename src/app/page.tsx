import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { homePath } from '@/lib/routes';
import { LoginWallpaper } from '@/components/login-wallpaper';

export default async function Home() {
  const session = await auth();
  if (session?.user?.email) {
    // Authenticated users land on the home hub (§4).
    redirect(homePath());
  }
  return (
    <main className="relative flex-1 flex flex-col items-center justify-center p-8 text-center gap-6">
      <LoginWallpaper />
      <h1 className="text-4xl font-bold tracking-tight">Kaojai</h1>
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
