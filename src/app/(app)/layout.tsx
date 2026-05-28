import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth, signOut } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { AppNav } from '@/components/app-nav';
import { normalizeLanguageCode } from '@/lib/languages';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login');
  }
  const userId = (session.user as { id?: string }).id;
  let lang = 'th';
  if (userId) {
    const [row] = await db
      .select({ target: users.targetLanguage })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (row) lang = normalizeLanguageCode(row.target);
  }
  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b bg-background">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <AppNav lang={lang} />
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {session.user.email}
            </span>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/' });
              }}
            >
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
