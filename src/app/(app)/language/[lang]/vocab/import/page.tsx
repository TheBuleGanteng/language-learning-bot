'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ImportResult {
  inserted: number;
  skippedDuplicatesInFile: number;
  skippedAlreadyInDb: number;
  skippedEmpty: number;
  lessonsCreated: number;
  tagsCreated: number;
  errors: string[];
}

interface PreviewRow {
  Thai?: string;
  English?: string;
  Lessons?: string;
  Tags?: string;
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const onFile = useCallback((f: File | null) => {
    setFile(f);
    setResult(null);
    setPreview([]);
    setTotalRows(0);
    if (!f) return;
    Papa.parse<PreviewRow>(f, {
      header: true,
      skipEmptyLines: true,
      preview: 10,
      complete: (res) => setPreview(res.data),
    });
    Papa.parse<PreviewRow>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => setTotalRows(res.data.length),
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (files) => onFile(files[0] ?? null),
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

  async function onImport() {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/vocab/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? 'Import failed');
        return;
      }
      setResult(data);
      toast.success(`Imported ${data.inserted} items`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Import vocab from Notion CSV</CardTitle>
          <CardDescription>
            Drag-and-drop or pick a CSV exported from your Notion vocab database. Expected
            columns: <code>Thai, English, Lessons, Tags</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            {...getRootProps()}
            className={cn(
              'flex flex-col items-center justify-center gap-3 px-6 py-8 rounded-md border-2 border-dashed transition-colors text-sm',
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/30 hover:border-muted-foreground/60 hover:bg-muted/30',
            )}
          >
            {/* Keep a real <input type="file"> in the DOM (hidden) so the
                file picker keyboard / accessibility / E2E paths all work. */}
            <input {...getInputProps()} />
            <Upload className="h-7 w-7 text-muted-foreground" />
            <p className="text-center">
              {isDragActive ? 'Drop to upload' : 'Drop your CSV file here'}
            </p>
            <Button type="button" variant="outline" onClick={open}>
              <Upload className="mr-2 h-4 w-4" />
              Choose file
            </Button>
            <p className="text-xs text-muted-foreground">
              Exported from Notion&apos;s Vocabulary database
            </p>
          </div>
          {file && (
            <p className="text-xs text-muted-foreground">
              {file.name} — {(file.size / 1024).toFixed(1)} KB
              {totalRows > 0 && ` — ${totalRows} rows`}
            </p>
          )}
          {preview.length > 0 && (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thai</TableHead>
                    <TableHead>English</TableHead>
                    <TableHead>Lessons</TableHead>
                    <TableHead>Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.Thai}</TableCell>
                      <TableCell>{r.English}</TableCell>
                      <TableCell className="text-xs">{r.Lessons}</TableCell>
                      <TableCell className="text-xs">{r.Tags}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Button onClick={onImport} disabled={!file || busy}>
            {busy ? 'Importing…' : totalRows ? `Import ${totalRows} rows` : 'Import'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Import summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt>Inserted</dt>
              <dd className="font-mono">{result.inserted}</dd>
              <dt>Skipped (duplicate in file)</dt>
              <dd className="font-mono">{result.skippedDuplicatesInFile}</dd>
              <dt>Skipped (already in DB)</dt>
              <dd className="font-mono">{result.skippedAlreadyInDb}</dd>
              <dt>Skipped (empty Thai/English)</dt>
              <dd className="font-mono">{result.skippedEmpty}</dd>
              <dt>Lessons created</dt>
              <dd className="font-mono">{result.lessonsCreated}</dd>
              <dt>Tags created</dt>
              <dd className="font-mono">{result.tagsCreated}</dd>
            </dl>
            {result.errors.length > 0 && (
              <details className="mt-4 text-xs">
                <summary>{result.errors.length} parse warnings</summary>
                <ul className="list-disc pl-5">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
