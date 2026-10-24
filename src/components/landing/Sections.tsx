"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { parseRoleDescription } from "@/lib/discovery/criteria";
import { CREDITS, FIELDS, type Field, type Shape } from "@/lib/fields";

const EASE = [0.22, 1, 0.36, 1] as const;
const INK = "#1f2750";

export function Stage({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen overflow-x-clip bg-[linear-gradient(180deg,#7783b2_0%,#939ec8_55%,#a7b0d6_100%)] text-white">{children}</div>;
}

export function YellowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex h-14 items-center gap-2 rounded-lg border-b-2 border-[#d29500] bg-gradient-to-b from-[#fbc72d] to-[#f9b407] px-7 text-lg font-medium text-[#1c2142] transition-[transform,filter] hover:brightness-105 active:translate-y-px">
      {children}<ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-1" />
    </Link>
  );
}

/** A 3x3 pool with one yellow, drawn flat for cards. */
function Pool({ shape }: { shape: Shape }) {
  const cells = Array.from({ length: 9 }, (_, i) => i);
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden>
      {cells.map((i) => {
        const x = 12 + (i % 3) * 36, y = 12 + Math.floor(i / 3) * 36, hero = i === 5, fill = hero ? "#f9b407" : "#56639f";
        switch (shape) {
          case "sphere": return <circle key={i} cx={x + 12} cy={y + 12} r={hero ? 14 : 10} fill={fill} />;
          case "cylinder": return <rect key={i} x={x + 4} y={y} width="16" height="24" rx="8" fill={fill} />;
          case "bars": { const h = 10 + ((i * 7) % 5) * 4; return <rect key={i} x={x + 4} y={y + 24 - h} width="16" height={h} rx="3" fill={fill} />; }
          case "dodeca": return <polygon key={i} points={`${x + 12},${y} ${x + 23},${y + 6} ${x + 23},${y + 18} ${x + 12},${y + 24} ${x + 1},${y + 18} ${x + 1},${y + 6}`} fill={fill} />;
          case "phone": return <rect key={i} x={x + 6} y={y} width="12" height="24" rx="3" fill={fill} />;
          default: return <rect key={i} x={x + 2} y={y + 2} width="20" height="20" rx="4" fill={fill} />;
        }
      })}
    </svg>
  );
}

function Heading({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 md:px-10">
      <h2 className="max-w-3xl text-4xl font-medium leading-[1.1] tracking-[-0.015em] md:text-6xl" style={{ color: INK }}>{children}</h2>
      {sub && <p className="mt-4 max-w-xl text-lg" style={{ color: "#33407a" }}>{sub}</p>}
    </div>
  );
}

const reveal = { initial: { opacity: 0, y: 40 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "0px 0px -10% 0px" } } as const;

type Status = "Live" | "Opt-in" | "Needs data";
const STATUS_STYLE: Record<Status, string> = { Live: "bg-[#5eead4]/20 text-[#7ff0dc]", "Opt-in": "bg-[#f9b407]/20 text-[#f9c840]", "Needs data": "bg-white/10 text-[#aab3dc]" };

const METRIC_GROUPS: { title: string; sub: string; items: { name: string; text: string; status: Status }[] }[] = [
  {
    title: "Relevance",
    sub: "Does the profile show the work you asked for? One score, 0 to 100, built only from quoted profile text.",
    items: [
      { name: "Evidence from real work", text: "Role descriptions count most, then the summary, job titles, headline and skills list. Skills alone never count as proof.", status: "Live" },
      { name: "What matters most to you", text: "Must-have, nice-to-have and context criteria, each with an importance, set from your brief and editable.", status: "Live" },
      { name: "Evidence AI reviewers find", text: "Reviewers read profiles for proof the keywords missed. It counts only if their quote appears word for word in the profile.", status: "Live" },
    ],
  },
  {
    title: "Career signals",
    sub: "How someone's career looks, scored separately so relevance stays pure. Signals that cannot be checked are left out, not counted as zero.",
    items: [
      { name: "Startup veteran", text: "Years at pre-seed or seed-stage startups with a lean engineering team of 15 or fewer. Candidates with the most of it can be ranked first.", status: "Live" },
      { name: "Joined companies while young", text: "Started within a few years of the company's founding.", status: "Live" },
      { name: "Lean-team employers", text: "Time spent at small companies.", status: "Live" },
      { name: "Rehired by the same company", text: "Left, then was asked back.", status: "Live" },
      { name: "Fast promotion", text: "A step up in title within one company, and how quickly.", status: "Live" },
      { name: "Repeat contract hires", text: "The same company engaging them again and again.", status: "Live" },
      { name: "Competitor experience", text: "The same kind of work at a rival you name.", status: "Live" },
    ],
  },
  {
    title: "Beyond the CV",
    sub: "Evidence from outside the profile.",
    items: [
      { name: "Quality of what they post", text: "An AI reviewer reads recent LinkedIn posts for real technical substance, not hype. Quotes are checked.", status: "Opt-in" },
      { name: "Open-source impact", text: "Stars times merged pull requests across their repositories.", status: "Needs data" },
      { name: "Patents and citations", text: "Patents cited in papers and how often their papers are cited.", status: "Needs data" },
      { name: "Built products with real users", text: "Shipped something people use.", status: "Needs data" },
      { name: "Promoted in a hard period", text: "Moved up while the company was struggling.", status: "Needs data" },
      { name: "Left a company that then closed", text: "Context, not merit: leaving a failing company says nothing against someone.", status: "Needs data" },
    ],
  },
];

export function Metrics() {
  return (
    <section className="py-12 md:py-20" aria-label="How candidates are ranked">
      <Heading sub="Every score links to the quote behind it. Nothing here uses age, gender, nationality or any protected trait.">How candidates are ranked</Heading>
      <div className="mx-auto mt-12 grid max-w-[1280px] gap-5 px-4 md:px-10 lg:grid-cols-3">
        {METRIC_GROUPS.map((g, gi) => (
          <motion.div key={g.title} {...reveal} transition={{ duration: 0.7, ease: EASE, delay: gi * 0.1 }}
            className="rounded-3xl bg-gradient-to-br from-[#323c6c] to-[#222950] p-7 shadow-[0_30px_50px_-30px_rgba(18,22,58,0.8)]">
            <h3 className="text-2xl font-medium">{g.title}</h3>
            <p className="mt-1 text-[15px] text-[#b6bee3]">{g.sub}</p>
            <ul className="mt-5 space-y-4">
              {g.items.map((m) => (
                <li key={m.name}>
                  <p className="flex flex-wrap items-center gap-2 text-[16px] font-medium">
                    {m.name}<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[m.status]}`}>{m.status}</span>
                  </p>
                  <p className="text-[15px] leading-snug text-[#b6bee3]">{m.text}</p>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
      <p className="mx-auto mt-5 max-w-[1280px] px-4 text-sm md:px-10" style={{ color: "#33407a" }}>
        <b>Live</b> works today. <b>Opt-in</b> runs only when you ask, because it costs credits. <b>Needs data</b> is built but waits on a connected data source.
      </p>
    </section>
  );
}

export function FieldGrid({ current }: { current?: string }) {
  return (
    <section className="py-12 md:py-20" aria-label="Fields">
      <Heading sub="Each page loads a sample brief for that speciality. Edit it, or write your own.">Pick the field you are hiring in</Heading>
      <ul className="mx-auto mt-12 grid max-w-[1280px] gap-5 px-4 sm:grid-cols-2 md:px-10 lg:grid-cols-3">
        {FIELDS.map((f, i) => (
          <motion.li key={f.slug} {...reveal} transition={{ duration: 0.7, ease: EASE, delay: (i % 3) * 0.08 }}>
            <Link href={`/fields/${f.slug}`} aria-current={current === f.slug ? "page" : undefined}
              className={`group relative flex h-full flex-col rounded-3xl bg-gradient-to-br from-[#323c6c] to-[#222950] p-6 shadow-[0_30px_50px_-30px_rgba(18,22,58,0.8)] transition-transform duration-300 hover:-translate-y-2 ${current === f.slug ? "ring-2 ring-[#f9b407]" : ""}`}>
              <div className="mb-6 h-32 w-32 transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110"><Pool shape={f.shape} /></div>
              <h3 className="text-2xl font-medium">{f.name}</h3>
              <p className="mt-2 flex-1 text-[#b6bee3]">{f.sub}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-[#f2b50f]">{current === f.slug ? "You are here" : `Open ${f.name}`}<ArrowRight size={16} aria-hidden className="transition-transform group-hover:translate-x-1" /></span>
            </Link>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

const STEPS = [
  { title: "Describe the role in your own words", body: "Paste a brief. Heavy Brains pulls out the must-haves, nice-to-haves and context. You edit them before anything runs." },
  { title: "Every score points at a quote", body: "People are ranked from evidence in real profiles. Missing evidence stays unknown and never counts as a match." },
  { title: "Then look outside your usual pool", body: "The Blind-Spot Finder surfaces people whose work supports your must-haves at companies you don't normally search." },
];

export function StackedSteps() {
  return (
    <section className="pb-4 pt-16 md:pt-24" aria-label="How it works">
      <Heading>From a brief to people you would have missed</Heading>
      <ol className="mx-auto mt-12 max-w-[1100px] px-4 md:px-10">
        {STEPS.map((s, i) => (
          <li key={s.title} className="sticky mb-6" style={{ top: `${6 + i * 1.6}rem` }}>
            <motion.div {...reveal} transition={{ duration: 0.7, ease: EASE }}
              className="flex min-h-[15rem] flex-col justify-between rounded-3xl bg-gradient-to-br from-[#323c6c] to-[#222950] p-8 shadow-[0_-20px_50px_-30px_rgba(18,22,58,0.9)] md:flex-row md:items-end md:p-12">
              <span className="text-7xl font-medium leading-none text-[#f2b50f] md:text-8xl">{i + 1}</span>
              <div className="md:max-w-xl">
                <h3 className="text-3xl font-medium leading-tight md:text-4xl">{s.title}</h3>
                <p className="mt-3 text-lg text-[#b6bee3]">{s.body}</p>
              </div>
            </motion.div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const WEIGHT = { must: 3, nice: 1.5, context: 1 } as const;
const TIER_LABEL = { must: "Must have", nice: "Nice to have", context: "Context" } as const;

/** Shows what the real extractor makes of this field's sample brief. */
export function WhatItReads({ field }: { field: Field }) {
  const parsed = parseRoleDescription(field.brief);
  const tiers = (["must", "nice", "context"] as const).map((t) => ({ t, items: parsed.criteria.filter((c) => c.tier === t) })).filter((g) => g.items.length);
  return (
    <section className="py-16 md:py-24" aria-label="What Heavy Brains reads">
      <Heading sub="This is the output of the criteria extractor for the sample brief above. Nothing here is mocked.">What Heavy Brains reads from the {field.name.toLowerCase()} brief</Heading>
      <div className="mx-auto mt-12 grid max-w-[1280px] grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-5 px-4 md:px-10">
        {tiers.map((g, gi) => (
          <motion.div key={g.t} {...reveal} transition={{ duration: 0.7, ease: EASE, delay: gi * 0.1 }}
            className="rounded-3xl bg-gradient-to-br from-[#323c6c] to-[#222950] p-7 shadow-[0_30px_50px_-30px_rgba(18,22,58,0.8)]">
            <div className="flex items-baseline justify-between">
              <h3 className="text-2xl font-medium">{TIER_LABEL[g.t]}</h3>
              <span className="text-sm text-[#b6bee3]">weight {WEIGHT[g.t]}</span>
            </div>
            <ul className="mt-5 flex flex-wrap gap-2">
              {g.items.map((c, i) => (
                <motion.li key={c.id} initial={{ opacity: 0, scale: 0.85 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 300, damping: 22, delay: 0.25 + i * 0.07 }}
                  className="rounded-full bg-[#222848] px-4 py-2 text-[15px] text-white ring-1 ring-white/10">{c.label}</motion.li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Word({ w, p, a, b }: { w: string; p: MotionValue<number>; a: number; b: number }) {
  const opacity = useTransform(p, [a, b], [0.2, 1]);
  return <motion.span style={{ opacity }} className="mr-[0.25em] inline-block">{w}</motion.span>;
}

const STATEMENT = "Your best hire is probably not at the company you were about to search.";

export function Closing() {
  const ref = useRef<HTMLElement>(null);
  const p = useScroll({ target: ref, offset: ["start 0.85", "end 0.65"] }).scrollYProgress;
  const words = STATEMENT.split(" ");
  return (
    <section ref={ref} className="mx-auto flex min-h-[90vh] max-w-[1280px] flex-col justify-center px-4 py-28 md:px-10">
      <p className="max-w-5xl text-5xl font-medium leading-[1.05] tracking-[-0.02em] md:text-7xl" style={{ color: INK }} aria-label={STATEMENT}>
        {words.map((w, i) => <Word key={i} w={w} p={p} a={(i / words.length) * 0.8} b={(i / words.length) * 0.8 + 0.2} />)}
      </p>
      <div className="mt-12 flex flex-wrap items-center gap-5">
        <YellowLink href="/discover">Open the workspace</YellowLink>
        <p className="text-[#33407a]">Demo mode uses a fictional dataset. Live mode searches Crustdata.</p>
      </div>
    </section>
  );
}

export function Credits() {
  return (
    <footer className="mx-auto max-w-[1280px] px-4 pb-12 text-sm leading-relaxed md:px-10" style={{ color: "#33407a" }}>
      <p>
        3D models from Sketchfab, used under{" "}
        <a className="underline underline-offset-4" href="http://creativecommons.org/licenses/by/4.0/" rel="noreferrer">CC BY 4.0</a>:{" "}
        {CREDITS.map((c, i) => (
          <span key={c.url}>
            <a className="underline underline-offset-4" href={c.url} rel="noreferrer">{c.title}</a> by {c.author}{i < CREDITS.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>
    </footer>
  );
}
