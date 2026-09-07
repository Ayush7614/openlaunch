import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Class-name joiner (the vendored theme toggler uses it).
 * `twMerge` resolves conflicting Tailwind utilities so a caller's className
 * always wins over a component's default (e.g. `p-2` passed in beats `p-4`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
