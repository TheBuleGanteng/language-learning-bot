import { LessonsIndexClient } from '@/components/lessons/lessons-index-client';

interface PageProps {
  params: Promise<{ lang: string }>;
}

export default async function LessonsIndexPage({ params }: PageProps) {
  const { lang } = await params;
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <LessonsIndexClient lang={lang} />
    </div>
  );
}
