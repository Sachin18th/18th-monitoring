/**
 * PitchService — generates a personalized email (subject + HTML body) for a
 * triggered campaign (Phase 4). Uses Claude via the official @anthropic-ai/sdk
 * when ANTHROPIC_API_KEY is configured; falls back to a deterministic template
 * so the pipeline works without a key.
 */

import Anthropic from '@anthropic-ai/sdk';

declare const process: { env: Record<string, string | undefined> };

const ANTHROPIC_MODEL = 'claude-opus-4-8';

export interface PitchContext {
  customerName: string;
  email: string | null;
  segment: string | null;
  totalLtv: number | null;
  favoriteCategories: string[];
  browsingCategories: string[];
  goal: string; // cart_recovery | win_back | welcome_offer | vip_appreciation
  trigger: string; // the fused segment
  storeName: string;
  storeUrl: string | null;
  recommendedProducts: Array<{ name: string | null; price: number | null; reason?: string; imageUrl?: string | null; url?: string | null }>;
}

export interface Pitch {
  subject: string;
  body: string; // HTML
  generator: 'claude' | 'template';
}

const GOAL_ANGLE: Record<string, { label: string; angle: string }> = {
  cart_recovery: { label: 'Complete your purchase', angle: 'They reached checkout but did not buy — nudge them warmly to finish, no pressure.' },
  win_back: { label: 'We miss you', angle: 'A lapsed customer who just came back to browse — welcome them back and re-engage.' },
  welcome_offer: { label: 'A little something to get started', angle: 'A high-intent new visitor with no purchase yet — encourage a first order.' },
  vip_appreciation: { label: 'A thank-you for being a VIP', angle: 'A loyal high-value customer — thank them and reward their loyalty.' },
};

export class PitchService {
  static async generate(ctx: PitchContext): Promise<Pitch> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (key) {
      try {
        return await this.viaClaude(ctx, key);
      } catch (err) {
        console.error('[PitchService] Claude generation failed, using template', (err as any)?.message);
      }
    }
    return this.viaTemplate(ctx);
  }

  private static async viaClaude(ctx: PitchContext, apiKey: string): Promise<Pitch> {
    const goal = GOAL_ANGLE[ctx.goal] || GOAL_ANGLE.vip_appreciation;
    const products = ctx.recommendedProducts
      .map(
        (p) =>
          `- ${p.name}${p.price != null ? ` ($${p.price})` : ''}${p.reason ? ` — ${p.reason}` : ''}` +
          `${p.imageUrl ? ` | image: ${p.imageUrl}` : ''}${p.url ? ` | link: ${p.url}` : ''}`,
      )
      .join('\n');

    const system =
      'You are an expert e-commerce lifecycle marketer. Write a single, concise, personalized marketing email. ' +
      'For each featured product, show its image with an <img> tag (use the given image URL, width 100%, max ~260px tall, object-fit:cover) and make both the image and the product name link to the product URL. ' +
      'Include one prominent "Shop Now" button linking to the store URL. ' +
      'Return ONLY a JSON object: {"subject": "<6-10 words>", "body": "<responsive HTML email, max 600px, inline styles, no <script>>"}. ' +
      'No markdown, no prose outside the JSON.';

    const user =
      `Store: ${ctx.storeName}\n` +
      (ctx.storeUrl ? `Store URL: ${ctx.storeUrl}\n` : '') +
      `Customer: ${ctx.customerName}${ctx.segment ? ` (segment: ${ctx.segment})` : ''}\n` +
      (ctx.totalLtv != null ? `Lifetime value: $${ctx.totalLtv}\n` : '') +
      (ctx.favoriteCategories.length ? `Favorite categories: ${ctx.favoriteCategories.join(', ')}\n` : '') +
      (ctx.browsingCategories.length ? `Recently browsing: ${ctx.browsingCategories.join(', ')}\n` : '') +
      `Campaign goal: ${goal.label}. ${goal.angle}\n` +
      (products ? `Feature these products (use the image + link for each):\n${products}\n` : '') +
      `Write the email now.`;

    const client = new Anthropic({ apiKey });
    // Stream to the final message so a longer generation can't hit a request
    // timeout; adaptive thinking lets the model reason about the personalization
    // without a fixed budget (Opus 4.8 rejects budget_tokens).
    const message = await client.messages
      .stream({
        model: ANTHROPIC_MODEL,
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        system,
        messages: [{ role: 'user', content: user }],
      })
      .finalMessage();

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = this.parseJson(text);
    if (!parsed?.subject || !parsed?.body) throw new Error('unparseable pitch');
    return { subject: String(parsed.subject), body: String(parsed.body), generator: 'claude' };
  }

  private static parseJson(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          return JSON.parse(m[0]);
        } catch {
          /* fall through */
        }
      }
      return null;
    }
  }

  /** Deterministic fallback — works with no API key. */
  private static viaTemplate(ctx: PitchContext): Pitch {
    const goal = GOAL_ANGLE[ctx.goal] || GOAL_ANGLE.vip_appreciation;
    const name = ctx.customerName || 'there';
    const subjectByGoal: Record<string, string> = {
      cart_recovery: `${name}, your cart is waiting 🛒`,
      win_back: `We miss you, ${name} 💜`,
      welcome_offer: `Welcome, ${name} — here's a pick for you`,
      vip_appreciation: `A thank-you for being a VIP, ${name}`,
    };
    const subject = subjectByGoal[ctx.goal] || `${name}, a pick just for you`;

    const shopUrl = ctx.storeUrl || '#';
    const cards = ctx.recommendedProducts
      .slice(0, 3)
      .map((p) => {
        const href = p.url || shopUrl;
        const img = p.imageUrl
          ? `<a href="${attr(href)}"><img src="${attr(p.imageUrl)}" alt="${attr(p.name || 'Product')}" style="width:100%;max-height:260px;object-fit:cover;display:block;" /></a>`
          : '';
        return `
        <div style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin:10px 0;">
          ${img}
          <div style="padding:12px;">
            <a href="${attr(href)}" style="font-weight:600;color:#111;text-decoration:none;">${escapeHtml(p.name || 'Product')}</a>
            ${p.price != null ? `<div style="color:#666;margin-top:2px;">$${p.price}</div>` : ''}
            ${p.reason ? `<div style="color:#999;font-size:12px;margin-top:2px;">${escapeHtml(p.reason)}</div>` : ''}
            <div style="margin-top:8px;"><a href="${attr(href)}" style="color:#111;font-size:13px;">View product →</a></div>
          </div>
        </div>`;
      })
      .join('');

    const body = `
      <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#222;">
        <h2 style="color:#111;">${escapeHtml(goal.label)}</h2>
        <p>Hi ${escapeHtml(name)},</p>
        <p>${escapeHtml(intro(ctx.goal, ctx.storeName))}</p>
        ${cards ? `<h3 style="color:#111;">Picked for you</h3>${cards}` : ''}
        <p style="margin-top:20px;text-align:center;">
          <a href="${attr(shopUrl)}" style="background:#111;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;">Shop now</a>
        </p>
        <p style="color:#999;font-size:12px;margin-top:24px;">${escapeHtml(ctx.storeName)}</p>
      </div>`;

    return { subject, body, generator: 'template' };
  }
}

function intro(goal: string, store: string): string {
  switch (goal) {
    case 'cart_recovery':
      return `You left something behind at ${store} — it's still available, and we saved it for you.`;
    case 'win_back':
      return `It's been a while! Here's what's new at ${store}, picked based on what you love.`;
    case 'welcome_offer':
      return `Thanks for stopping by ${store}. Here are a few things we think you'll like.`;
    default:
      return `Thank you for being one of our best customers at ${store}. Here's a little something picked just for you.`;
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Escape a value destined for an HTML attribute (href/src). */
function attr(s: string): string {
  return String(s).replace(/[&"'<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' }[c] as string));
}
