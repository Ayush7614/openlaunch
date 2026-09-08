/** User pause, inspection and accessibility preferences always beat autoplay. */
export function shouldAnimateLaunch({ paused, inspecting, motionAllowed, inView, pageVisible }: {
  paused: boolean;
  inspecting: boolean;
  motionAllowed: boolean;
  inView: boolean;
  pageVisible: boolean;
}) {
  return motionAllowed && inView && pageVisible && !paused && !inspecting;
}
