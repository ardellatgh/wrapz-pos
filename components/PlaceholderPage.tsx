import { Card } from "@/components/ui/Card";

export function PlaceholderPage({
  title,
  stage,
}: {
  title: string;
  stage: string;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-sans text-2xl font-bold tracking-tight text-brand-text">{title}</h1>
      <Card className="mt-4">
        <p className="text-sm leading-relaxed text-brand-text/75">
          This screen is a <strong>Stage 1 placeholder</strong>. Full functionality ships in{" "}
          <strong>{stage}</strong>.
        </p>
      </Card>
    </div>
  );
}
