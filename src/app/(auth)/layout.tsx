import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh flex flex-col items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-md">
        <Link href="/" className="block text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Language Learning Bot</h1>
        </Link>
        {children}
      </div>
    </div>
  );
}
