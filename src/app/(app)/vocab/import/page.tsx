'use client';

import { useState } from 'react';
import Papa from 'papaparse';
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

  function onFile(f: File | null) {
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
    // Count total rows in a second pass (cheap enough for a few MB)
    Papa.parse<PreviewRow>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => setTotalRows(res.data.length),
    });
  }

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
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:hover:bg-muted"
          />
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
