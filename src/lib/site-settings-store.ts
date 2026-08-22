import { getMongo } from "./mongo";

export type SocialLink = {
  platform: 'linkedin' | 'instagram' | 'github' | 'x';
  url: string;
  enabled: boolean;
};

export type PageLink = {
  label: string;
  url: string;
  enabled: boolean;
};

export type SiteSettings = {
  footerDescription: string;
  extensionDescription: string;
  socials: SocialLink[];
  pages: PageLink[];
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  // SEO Section (Rich text)
  seoTitle: string;
  seoContent: string;
};

export const defaultSocials: SocialLink[] = [
  { platform: 'linkedin', url: '#', enabled: true },
  { platform: 'instagram', url: '#', enabled: true },
  { platform: 'github', url: '#', enabled: true },
  { platform: 'x', url: '#', enabled: true }
];

export const defaultPages: PageLink[] = [
  { label: 'Acceptable use', url: '/acceptable-use', enabled: true },
  { label: 'Privacy', url: '/privacy', enabled: true },
  { label: 'Terms', url: '/terms', enabled: true },
  { label: 'Refunds', url: '/refund-policy', enabled: true },
  { label: 'Contact', url: '/contact', enabled: true }
];

export const defaultSiteSettings: SiteSettings = {
  footerDescription: "Fast, private, and thoughtfully designed sharing for developers. Built to keep your workflow moving.",
  extensionDescription: "Share text from any page in one click, right from Chrome.",
  socials: defaultSocials,
  pages: defaultPages,
  heroEyebrow: "Private by default · No account required",
  heroTitle: "Share text and code without the clutter.",
  heroSubtitle: "Paste anything, choose when it expires, and send one simple link.",
  seoTitle: "Why developers choose TextShare",
  seoContent: `<p>TextShare is a simple way to share text, code, notes, and images through a link. Paste your content, choose your sharing options, and create a room that you can send to anyone.</p>
<p>There is no complicated setup. For basic sharing, you can get started without creating an account. When you no longer need a room, its expiration settings can automatically remove it from availability.</p>
<p>Whether you are sharing a code snippet with a developer, sending notes to a friend, moving text between your devices, or temporarily sharing information with a team member, TextShare keeps the process fast and straightforward.</p>
<p><strong>Paste your content. Set your options. Create your link.</strong></p>
<h2>A Simple Way to Share Text and Code</h2>
<p>TextShare works like a lightweight online text editor combined with a temporary sharing tool. Instead of putting a long message into a chat, sending an email to yourself, or creating a document just to share a few lines, you can create a dedicated room and send its link.</p>
<p>It works well for everyday content such as:</p>
<ul>
  <li>Code snippets and programming examples</li>
  <li>JSON, SQL, and configuration data</li>
  <li>Error messages and logs</li>
  <li>Notes and instructions</li>
  <li>URLs and other plain text</li>
  <li>Terminal commands</li>
  <li>Screenshots and images</li>
  <li>Temporary information that you do not want to keep permanently</li>
</ul>
<p>The recipient only needs the room link to view the shared content.</p>
<h2>Built for Quick and Flexible Sharing</h2>
<p>Creating a room takes only a few steps. Enter your text or code, select the options you need, and create your share.</p>
<p>You can choose an expiration period so the room does not remain available indefinitely. If you are sharing code, syntax highlighting makes it easier to read. You can also choose your preferred link style and, where available on your plan, create a custom slug for a more recognizable URL.</p>
<p>For content that needs additional protection, password protection provides another layer of access control.</p>
<h2>More Control After You Create a Room</h2>
<p>Creating the link is only the beginning. TextShare also gives you tools for managing an existing room.</p>
<p>Depending on your plan, you can:</p>
<ul>
  <li><strong>Track access analytics</strong> to see room activity and visits.</li>
  <li><strong>Extend the room duration</strong> when you need more time.</li>
  <li><strong>Edit the room text</strong> without creating another share.</li>
  <li><strong>Download the content as a TXT file</strong> for offline use.</li>
  <li><strong>Revoke the link</strong> when you want to stop access.</li>
  <li><strong>Use a custom slug</strong> to create a more memorable room address.</li>
</ul>
<p>These options make TextShare useful for both one-time sharing and content that needs to be managed for a longer period.</p>
<h2>Useful for Developers and Everyone Else</h2>
<p>TextShare is particularly convenient for developers because code, JSON, logs, and configuration data are often difficult to share cleanly through ordinary messaging apps.</p>
<p>Instead of sending screenshots or breaking a large code block across multiple messages, you can put the content into one room and share the link. Syntax highlighting can make supported code easier to understand, while the expiration and access controls give you more control over temporary information.</p>
<p>But you do not need to be a developer to use TextShare. Students can share notes, teams can exchange instructions, and anyone can use it to quickly move text between devices.</p>
<h2>Share Between Your Devices</h2>
<p>A TextShare room can also act as a simple bridge between devices.</p>
<p>Create a room on your computer and open it from your phone using the room link or QR code. This can be useful when you need to transfer a piece of text without sending yourself an email or setting up a synchronization service.</p>
<h2>Share Only What You Need</h2>
<p>TextShare is designed around a simple idea: <strong>sharing information should not require a complicated workflow.</strong></p>
<p>You decide what to share, how long it should remain available, and which controls you want to use. Basic sharing stays quick, while additional features give you more control when you need it.</p>
<p>From a small code snippet to temporary notes or screenshots, TextShare gives you one simple place to create and manage a shareable room.</p>
<h2>Start Sharing</h2>
<p>Open TextShare, paste your content, choose your settings, and create your room.</p>
<p><strong>No clutter. No unnecessary setup. Just a simple way to share.</strong></p>`
};

export async function getSiteSettings(): Promise<SiteSettings> {
  const { db } = await getMongo();
  const settings = await db.collection("siteSettings").findOne({ id: "global" });
  if (!settings) {
    return defaultSiteSettings;
  }
  return {
    footerDescription: settings.footerDescription || defaultSiteSettings.footerDescription,
    extensionDescription: settings.extensionDescription || defaultSiteSettings.extensionDescription,
    socials: settings.socials || defaultSiteSettings.socials,
    pages: settings.pages || defaultSiteSettings.pages,
    heroEyebrow: settings.heroEyebrow || defaultSiteSettings.heroEyebrow,
    heroTitle: settings.heroTitle || defaultSiteSettings.heroTitle,
    heroSubtitle: settings.heroSubtitle || defaultSiteSettings.heroSubtitle,
    seoTitle: settings.seoTitle || defaultSiteSettings.seoTitle,
    seoContent: settings.seoContent || defaultSiteSettings.seoContent
  };
}

export async function saveSiteSettings(settings: SiteSettings) {
  const { db } = await getMongo();
  await db.collection("siteSettings").replaceOne(
    { id: "global" },
    { id: "global", ...settings, updatedAt: new Date() },
    { upsert: true }
  );
}
