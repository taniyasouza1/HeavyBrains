"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { useApp } from "@/components/app-shell/AppProvider";
import { parseRoleDescription } from "@/lib/discovery/criteria";
import { FIELDS, type Field } from "@/lib/fields";
import { AUTORUN_KEY } from "@/lib/autorun";
import { Pendant } from "./Pendant";

const FieldScene = dynamic(() => import("./FieldScene"), { ssr: false });

const HEX = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'><path d='M28 66L0 50V16L28 0l28 16v34zM28 100L0 84V50l28-16 28 16v34z' fill='none' stroke='%23ffffff' stroke-opacity='.045' stroke-width='1.5'/></svg>\")";

function FormField({ label, aside, children, className }: { label: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-[13px] font-medium text-[#aab3dc]"><label>{label}</label>{aside}</div>
      <div className="rounded-xl bg-[#1b2144] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-inset ring-white/10 transition-shadow focus-within:ring-2 focus-within:ring-[#f9b407] hover:ring-white/25">{children}</div>
    </div>
  );
}

const bare = "w-full bg-transparent text-[17px] text-white outline-none focus-visible:outline-none placeholder:text-[#6f7ab0]";

export function FieldHero({ field }: { field: Field }) {
  const router = useRouter();
  const { hydrated, update } = useApp();
  const still = !!useReducedMotion();
  const [brief, setBrief] = useState(field.brief);
  const ref = useRef<HTMLElement>(null);
  const p = useScroll({ target: ref, offset: ["start start", "end start"] }).scrollYProgress;
  const objectY = useTransform(p, [0, 1], [0, -110]);
  const cardY = useTransform(p, [0, 1], [0, 36]);

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseRoleDescription(brief);
    update((proj) => ({ ...proj, roleDescription: brief, criteria: parsed }));
    // The workspace reads this once and starts the search, so the visitor lands on results instead of more forms.
    sessionStorage.setItem(AUTORUN_KEY, "1");
    router.push("/discover");
  };

  return (
    <section ref={ref} className="relative px-4 pb-10 pt-[14vh] md:px-10">
      <Pendant className="pointer-events-none absolute left-[64%] top-0 z-20 hidden md:block" />
      <motion.div style={{ y: cardY }} className="relative mx-auto max-w-[1280px] rounded-[28px] bg-gradient-to-br from-[#323c6c] to-[#222950] shadow-[0_44px_70px_-34px_rgba(18,22,58,0.8)]">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]" aria-hidden>
          <div className="absolute inset-0" style={{ backgroundImage: HEX }} />
          <div className="absolute left-[56%] top-0 h-64 w-96 -translate-x-1/2 rounded-full bg-[#ffd35c] opacity-[0.14] blur-3xl" />
        </div>

        <div className="relative px-6 py-8 md:min-h-[660px] md:px-14 md:py-12">
          <div className="flex items-center justify-between gap-6">
            <Link href="/" className="font-display text-xl font-bold tracking-tight text-white">Heavy Brains</Link>
            <nav aria-label="Fields" className="hidden items-center gap-6 text-[15px] text-[#b6bee3] lg:flex lg:pr-[38%]">
              {FIELDS.slice(0, 3).map((f) => <Link key={f.slug} href={`/fields/${f.slug}`} className="transition-colors hover:text-white">{f.name.split(" ")[0]}</Link>)}
              <Link href="/discover" className="transition-colors hover:text-white">Workspace</Link>
            </nav>
          </div>

          <div className="mt-14 md:mt-16 md:w-[52%]">
            <motion.h1
              initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              className="font-display text-[clamp(2.2rem,4.2vw,3.7rem)] font-medium leading-[1.12] tracking-[-0.01em] text-white text-balance"
            >
              {field.headline[0]}<span className="text-[#f2b50f]">{field.headline[1]}</span>{field.headline[2]}
            </motion.h1>
            <p className="mt-4 max-w-lg text-lg leading-snug text-[#b6bee3]">{field.sub}</p>

            <form onSubmit={start} className="mt-9 space-y-5">
              <FormField
                label="Describe the person you need"
                aside={brief !== field.brief && <button type="button" onClick={() => setBrief(field.brief)} className="text-[13px] text-[#f2b50f] underline-offset-4 hover:underline">Use the example</button>}
              >
                <textarea aria-label="Describe the role" className={`${bare} block resize-none px-4 py-3.5 text-base leading-relaxed`} rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Role, must-have experience, location if it matters" />
              </FormField>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <button
                  type="submit" disabled={!hydrated || !brief.trim()}
                  className="group inline-flex h-14 items-center gap-2.5 rounded-xl border-b-2 border-[#d29500] bg-gradient-to-b from-[#fbc72d] to-[#f9b407] px-8 text-lg font-medium text-[#1c2142] transition-[transform,filter] hover:brightness-105 active:translate-y-px disabled:opacity-50"
                >
                  Find people<ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-1" />
                </button>
                <p className="max-w-[16rem] text-sm leading-snug text-[#8f99c7]">We read your brief and run the search. You can adjust everything on the next screen.</p>
              </div>
            </form>
          </div>
        </div>

        <motion.div style={{ y: objectY }} className="pointer-events-none relative z-10 h-80 w-full md:absolute md:-bottom-[13%] md:-right-[5%] md:h-[108%] md:w-[46%]">
          <div className="absolute bottom-[9%] left-[14%] h-[11%] w-[72%] rounded-full bg-[#0c1030]/45 blur-2xl" aria-hidden />
          <div className="absolute inset-0"><FieldScene shape={field.shape} model={field.model} rotate={field.modelRotation} still={still} /></div>
        </motion.div>
      </motion.div>
    </section>
  );
}
