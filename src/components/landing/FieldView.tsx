"use client";

import type { Field } from "@/lib/fields";
import { FieldHero } from "./FieldHero";
import { Closing, Credits, FieldGrid, Stage, WhatItReads } from "./Sections";

export function FieldView({ field }: { field: Field }) {
  return (
    <Stage>
      <FieldHero field={field} />
      <WhatItReads field={field} />
      <FieldGrid current={field.slug} />
      <Closing />
      <Credits />
    </Stage>
  );
}
