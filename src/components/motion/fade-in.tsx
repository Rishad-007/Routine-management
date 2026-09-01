"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

export function FadeIn({
  children,
  stagger = 0,
  ...props
}: HTMLMotionProps<"div"> & { stagger?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut", delay: stagger }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
