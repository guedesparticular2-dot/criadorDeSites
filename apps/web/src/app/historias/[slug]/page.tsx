import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CommunityComments } from "../../../components/community-comments";
import { SiteHeader } from "../../../components/site-header";
import { getCurrentUser } from "../../../lib/auth";
import { getPublishedContentBySlug } from "../../../lib/content";
import { isApprovedTenantMember, listPublicComments } from "../../../lib/community";
import { getTenantFromHost } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = await getTenantFromHost((await headers()).get("host") ?? "");
  if (!tenant) notFound();
  const { slug } = await params;
  const story = await getPublishedContentBySlug(tenant.id, slug);
  if (!story || story.contentType !== "NEWS") notFound();
  const user = await getCurrentUser();
  const canParticipate = user ? await isApprovedTenantMember(tenant.id, user.id) : false;
  const paragraphs = Array.isArray(story.body.paragraphs) ? story.body.paragraphs : [];
  const comments = story.commentsEnabled ? await listPublicComments(tenant.id, story.id, user?.id) : [];
  return <main className="story-page"><SiteHeader clubName={tenant.displayName} /><article className="story-article"><Link className="story-back" href="/#noticias">← Voltar às histórias</Link><span className="eyebrow dark">ISSO AQUI É {tenant.displayName.toUpperCase()}</span><h1>{story.title}</h1>{story.summary && <p className="story-summary">{story.summary}</p>}<div className="story-body">{paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph}`}>{paragraph}</p>)}</div>{story.commentsEnabled && <CommunityComments contentId={story.id} initialComments={comments.map((comment) => ({ ...comment, createdAt: comment.createdAt.toISOString() }))} canParticipate={canParticipate} />}</article><footer className="story-footer"><Link href="/#noticias">{tenant.displayName} · Histórias da comunidade</Link></footer></main>;
}
