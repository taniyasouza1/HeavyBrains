import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FieldView } from "@/components/landing/FieldView";
import { FIELDS, getField } from "@/lib/fields";

export function generateStaticParams() {
  return FIELDS.map((f) => ({ field: f.slug }));
}

export async function generateMetadata({ params }: PageProps<"/fields/[field]">): Promise<Metadata> {
  const f = getField((await params).field);
  return f ? { title: `${f.name} talent discovery — Heavy Brains`, description: f.sub } : {};
}

export default function Page({ params }: PageProps<"/fields/[field]">) {
  return (
    <Suspense fallback={null}>
      <Field params={params} />
    </Suspense>
  );
}

async function Field({ params }: { params: PageProps<"/fields/[field]">["params"] }) {
  const field = getField((await params).field);
  if (!field) notFound();
  return <FieldView field={field} />;
}
