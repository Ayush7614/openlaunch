import type { Metadata } from "next";
import { PostsFeed } from "@/components/launchpad/Posts";
import { listFeed } from "@/lib/launchpad/postsServer";

export const metadata: Metadata = { title: "Posts", description: "What people are saying about tokens launched on openlaunch.lol." };
export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const posts = await listFeed(100);
  return (
    <main className="mx-auto max-w-3xl px-4 pt-8 sm:pt-10 pb-16 space-y-6">
      <header>
        <h1 className="font-display font-bold tracking-[-0.02em] text-ink text-3xl sm:text-4xl">Posts</h1>
        <p className="mt-2 text-base text-body">Comments from holders, traders and creators, across every token. Posting happens on the token pages.</p>
      </header>
      <PostsFeed initial={posts} />
    </main>
  );
}
