/** Line icons for the footer's social links; networks without one show their initial. */
const P: Record<string, React.ReactNode> = {
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></>,
  x: <path d="M4 4l16 16M20 4 4 20" />,
  youtube: <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3Z" /></>,
  tiktok: <path d="M14 3v11a4 4 0 1 1-4-4M14 3c0 3 2 5 5 5" />,
  twitch: <><path d="M4 3h16v11l-5 5h-4l-3 3v-3H4Z" /><path d="M10 8v4M15 8v4" /></>,
  discord: <><path d="M8 17c-2 0-4-1-5-2 0-4 1-8 3-10 1.5-.7 3-1 4-1l.5 1.5h3L14 4c1 0 2.5.3 4 1 2 2 3 6 3 10-1 1-3 2-5 2l-1-2" /><circle cx="9" cy="11.5" r="1.3" /><circle cx="15" cy="11.5" r="1.3" /></>,
  facebook: <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8Z" />,
  linkedin: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 11v6M8 7.5v.01M12 17v-6M12 13.5a2.5 2.5 0 0 1 5 0V17" /></>,
  whatsapp: <><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7Z" /><path d="M9 9.5c.5 2 2.5 4 4.5 4.5l1-1 2 1c-.3 1-1.3 1.8-2.5 1.5A8 8 0 0 1 8 10c-.3-1.2.5-2.2 1.5-2.5l1 2Z" /></>,
  telegram: <path d="m21 4-18 7 6 2 2 6 3-4 5 4Z M9 13l8-6" />,
  snapchat: <path d="M12 3c3 0 5 2 5 5v3l2 1-2 1c.5 2 2 3 3 3-1 1-2 1-3 1l-1 2c-1 0-2-1-4-1s-3 1-4 1l-1-2c-1 0-2 0-3-1 1 0 2.5-1 3-3l-2-1 2-1V8c0-3 2-5 5-5Z" />,
  kick: <path d="M5 4h4v5h2V7h2V5h6v5h-2v2h-2v0h2v2h2v5h-6v-2h-2v-2h-2v5H5Z" />,
};
export function SocialIcon({ k }: { k: string }) {
  const p = P[k];
  if (!p) return <span style={{ fontSize: 12, fontWeight: 700 }}>{k[0].toUpperCase()}</span>;
  return <svg className="i" viewBox="0 0 24 24" style={{ width: 17, height: 17 }} aria-hidden="true">{p}</svg>;
}
