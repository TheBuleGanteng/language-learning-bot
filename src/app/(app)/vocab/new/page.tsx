import { VocabForm } from '@/components/vocab/vocab-form';

export default function NewVocabPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Add vocab</h1>
      <VocabForm mode="new" />
    </div>
  );
}
