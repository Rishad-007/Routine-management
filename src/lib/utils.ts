import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Fold a value for substring search: lowercase + collapse internal whitespace.
 *
 * Names are typed with inconsistent spacing in practice ("Md.  Rahim" vs
 * "md rahim"), so an un-normalized `includes` misses rows a human considers
 * identical. Codes and ids contain no spaces but go through the same path so
 * one comparison helper serves every search box.
 */
export function normalizeSearch(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim()
}

