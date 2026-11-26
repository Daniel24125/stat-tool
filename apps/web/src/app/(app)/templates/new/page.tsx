import Link from "next/link";
import { TemplateEditor } from "@/components/template-editor";

export default function NewTemplatePage() {
  return (
    <div className="max-w-3xl">
      <Link href="/templates" className="text-sm text-slate-500 hover:text-ink">Templates</Link>
      <h1 className="mb-6 mt-1 text-3xl">New template</h1>
      <TemplateEditor />
    </div>
  );
}
