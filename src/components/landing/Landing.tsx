"use client";

import { GENERAL } from "@/lib/fields";
import { FieldHero } from "./FieldHero";
import { Closing, Credits, FieldGrid, Metrics, Stage, StackedSteps } from "./Sections";

export function Landing() {
  return (
    <Stage>
      <FieldHero field={GENERAL} />
      <StackedSteps />
      <Metrics />
      <FieldGrid />
      <Closing />
      <Credits />
    </Stage>
  );
}
