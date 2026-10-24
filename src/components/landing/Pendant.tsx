"use client";

import { motion } from "motion/react";

/** A hanging lamp: the cord drops from the top of the page and swings once on load, like the reference. */
export function Pendant({ className }: { className?: string }) {
  return (
    <motion.div
      aria-hidden
      className={className}
      style={{ transformOrigin: "50% 0" }}
      initial={{ rotate: 0 }}
      animate={{ rotate: [0, 6, -4, 2.5, -1.2, 0] }}
      transition={{ duration: 3.4, delay: 0.5, ease: "easeInOut" }}
    >
      <div className="mx-auto h-[calc(14vh+5.5rem)] w-[2px] bg-gradient-to-b from-[#c9a24a] to-[#a88331]" />
      <div className="relative mx-auto -mt-px h-0 w-0">
        <div className="absolute left-1/2 top-0 h-[70px] w-[150px] -translate-x-1/2 bg-white" style={{ clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }} />
        <div className="absolute left-1/2 top-[66px] h-[6px] w-[150px] -translate-x-1/2 rounded-b-full bg-gradient-to-b from-[#c9a24a] to-[#9c7a2d]" />
        <div className="absolute left-1/2 top-[70px] size-4 -translate-x-1/2 rounded-full bg-[#fff2c2] shadow-[0_0_40px_14px_rgba(255,214,102,0.55)]" />
      </div>
    </motion.div>
  );
}
