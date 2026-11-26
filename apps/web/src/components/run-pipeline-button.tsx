"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { startPipelineRun } from "@/app/pipeline-actions";
import { Button, Select } from "@/components/ui";

export function RunPipelineButton({ projectId, pipelineId, datasets }: { projectId: string; pipelineId: string; datasets: { id: string; name: string }[] }) {
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <Select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
        {datasets.length === 0 && <option value="">No ready datasets</option>}
        {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </Select>
      <Button disabled={!datasetId || pending} onClick={() => start(async () => {
        const r = await startPipelineRun(projectId, pipelineId, datasetId);
        if (r.ok) { toast.success("Pipeline started. You'll be notified when it finishes."); router.push(`/projects/${projectId}/pipeline-runs/${r.runId}`); }
        else toast.error(r.error);
      })}>
        <Play className="h-4 w-4" /> {pending ? "Starting…" : "Run"}
      </Button>
    </div>
  );
}
