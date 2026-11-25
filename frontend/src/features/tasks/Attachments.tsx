import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshTasks } from "@/features/projects/queries";
import { ApiError } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";
import { formatSize } from "@/lib/format";
import type { TaskDetail } from "@/lib/types";
import { messages } from "@/messages";

// The JSON helper cannot send files: a file goes as multipart and the browser sets the headers itself.
async function uploadFile(taskKey: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/tasks/${taskKey}/attachments`, { method: "POST", body });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    throw new ApiError(res.status, res.status === 413 ? "file_too_large" : (data?.error?.code ?? "unknown"));
  }
}

export function Attachments({ detail, projectKey, readOnly }: { detail: TaskDetail; projectKey: string; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const taskKey = detail.task.key;

  const upload = useMutation({
    mutationFn: (file: File) => uploadFile(taskKey, file),
    onSuccess: async () => {
      feedback.success(messages.task.uploaded);
      await refreshTasks(queryClient, projectKey, taskKey);
    },
    onError: feedback.fail,
    onSettled: () => {
      if (input.current) input.current.value = "";
    },
  });

  return (
    <section aria-labelledby="attachments-title" className="space-y-2">
      <h3 id="attachments-title" className="text-sm font-semibold">
        {messages.task.attachments}
      </h3>
      {detail.attachments.length === 0 && <p className="text-muted-foreground text-sm">{messages.task.noAttachments}</p>}
      <ul className="space-y-1">
        {detail.attachments.map((file) => (
          <li key={file.id} className="bg-card flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
            <a className="text-primary flex min-w-0 items-center gap-2 hover:underline" href={`/api/attachments/${file.id}/download`} download={file.filename}>
              <Paperclip className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{file.filename}</span>
            </a>
            <span className="text-muted-foreground shrink-0 text-xs">
              {formatSize(file.size)} · {file.uploadedByName}
            </span>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="flex items-center gap-3">
          <input
            ref={input}
            type="file"
            className="sr-only"
            id="attachment-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
            }}
          />
          <Button type="button" variant="secondary" size="sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
            {upload.isPending ? messages.task.uploading : messages.task.upload}
          </Button>
          <span className="text-muted-foreground text-xs">{messages.task.uploadHelp}</span>
        </div>
      )}
    </section>
  );
}
