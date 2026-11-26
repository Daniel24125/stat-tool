"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { uploadDataset } from "@/app/actions";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export function UploadDataset({ projectId }: { projectId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function submit() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    start(async () => {
      const res = await uploadDataset(projectId, fd);
      if (res.ok) {
        toast.success("Dataset profiled.");
        setFile(null);
        router.push(`/projects/${projectId}/datasets/${res.datasetId}`);
      } else toast.error(res.error);
    });
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0] ?? null); }}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed bg-white px-6 py-8 text-center",
        drag ? "border-brand-500 bg-brand-50" : "border-slate-300",
      )}
    >
      <Upload className="h-6 w-6 text-slate-400" />
      <div className="text-sm text-slate-600">
        {file ? <span className="font-medium text-slate-900">{file.name}</span> : "Drop a CSV, TSV or XLSX file here (max 50 MB)"}
      </div>
      <input ref={input} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={pending}>Choose file</Button>
        <Button size="sm" onClick={submit} disabled={!file || pending}>{pending ? "Uploading and profiling…" : "Upload"}</Button>
      </div>
    </div>
  );
}
