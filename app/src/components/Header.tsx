import { connection } from "next/server";
import HeaderNav from "./HeaderNav";
import { readPulse } from "@/lib/launchpad/presence";

export default async function Header() {
  await connection();
  const pulse = await readPulse().catch(() => ({ visits: 0, online: 0 }));
  return <HeaderNav pulse={pulse} />;
}
