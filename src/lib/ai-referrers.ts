// Maps a referrer URL to a normalised LLM-assistant source, or null if it isn't
// one. Used server-side by /api/track-referral as the authoritative classifier
// (the client beacon pre-filters, but we never trust the client's label).
//
// Deliberately NARROW: only genuine AI-assistant hosts. Plain search engines
// (google.com, bing.com, duckduckgo.com) are NOT here — Bing's search and
// Microsoft Copilot are different referrers; we only want copilot.microsoft.com.

const SOURCES: { source: string; hosts: string[] }[] = [
  { source: 'chatgpt',    hosts: ['chatgpt.com', 'chat.openai.com', 'openai.com'] },
  { source: 'gemini',     hosts: ['gemini.google.com', 'bard.google.com'] },
  { source: 'perplexity', hosts: ['perplexity.ai'] },
  { source: 'copilot',    hosts: ['copilot.microsoft.com'] },
  { source: 'claude',     hosts: ['claude.ai'] },
  { source: 'deepseek',   hosts: ['deepseek.com', 'chat.deepseek.com'] },
  { source: 'grok',       hosts: ['grok.com', 'x.ai'] },
  { source: 'mistral',    hosts: ['mistral.ai', 'chat.mistral.ai'] },
  { source: 'you',        hosts: ['you.com'] },
  { source: 'poe',        hosts: ['poe.com'] },
  { source: 'phind',      hosts: ['phind.com'] },
];

// host matches a target if it IS the host or a subdomain of it.
function hostMatches(host: string, target: string): boolean {
  return host === target || host.endsWith('.' + target);
}

export function classifyAiReferrer(referrer: string | null | undefined): { host: string; source: string } | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  if (!host) return null;
  for (const { source, hosts } of SOURCES) {
    if (hosts.some(h => hostMatches(host, h))) return { host, source };
  }
  return null;
}
