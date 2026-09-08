import { Inter, Space_Mono, Unbounded } from "next/font/google";

/**
 * Font loaders shared by the root layout and global-error.tsx.
 * global-error replaces the root layout when active, so it cannot inherit
 * these variables — it imports them from here instead of duplicating them.
 */
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
export const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono", display: "swap" });
export const unbounded = Unbounded({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-unbounded", display: "swap" });
