"use client";

import { useEffect, useState } from "react";
import { useLive } from "./LiveProvider";

/**
 * Whether the BOOST switch is on, as the shared live poll last said. No request of its own. False until a poll says
 * otherwise (the server render and the first client render agree), and a poll from a machine that predates boosts
 * changes nothing. Switching BOOST off reaches open tabs within one poll.
 */
export function useBoostOn(): boolean {
  const { live, subscribe } = useLive();
  const [on, setOn] = useState(live.boost?.enabled === true);
  useEffect(
    () =>
      subscribe((snap) => {
        if (snap.boost) setOn(snap.boost.enabled);
      }),
    [subscribe],
  );
  return on;
}
