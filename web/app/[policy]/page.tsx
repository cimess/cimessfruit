import { notFound } from "next/navigation";
import Link from "next/link";
import policies from "@/lib/legal/policies.json";
import StoreShell from "../store/store-shell";

export function generateStaticParams() {
  return Object.keys(policies).map(policy => ({ policy }));
}

export default async function PolicyPage({ params }: { params: Promise<{ policy: string }> }) {
  const { policy } = await params;
  if (!Object.hasOwn(policies, policy)) notFound();
  const content = policies[policy as keyof typeof policies];
  return (
    <StoreShell>
      <article className="store-section" style={{ maxWidth: 850, margin: "auto", lineHeight: 1.8 }}>
        <nav aria-label="Legal policies" style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          {Object.entries(policies).map(([id, item]) => (
            <Link key={id} href={`/${id}`} aria-current={id === policy ? "page" : undefined}>{item.title}</Link>
          ))}
        </nav>
        <h1>{content.title}</h1>
        <p>Revised <time dateTime={content.updatedAt}>{content.updatedAt}</time> · Version {content.version}</p>
        <p>{content.summary}</p>
        <details style={{ margin: "2rem 0" }}>
          <summary>Contents — {content.sections.length} sections</summary>
          <ol>
            {content.sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title.replace(/^\d+\. /, "")}</a></li>)}
          </ol>
        </details>
        {content.sections.map(section => (
          <section key={section.id} id={section.id} style={{ margin: "2rem 0", scrollMarginTop: "6rem" }}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </section>
        ))}
        <aside aria-label="Contact and official resources">
          <h2>Contact and official resources</h2>
          <p><a href="mailto:cimessinvest@gmail.com">cimessinvest@gmail.com</a> · <a href="tel:+2348089273565">+234 808 927 3565</a></p>
          <ul>{content.links.map(link => <li key={link.url}><a href={link.url} rel="noreferrer">{link.label}</a></li>)}</ul>
          <Link href="/account-deletion">Disable my account</Link>
          <p>Disabling stops account access; it is not automatic permanent erasure. Contact us separately about erasure.</p>
        </aside>
      </article>
    </StoreShell>
  );
}
