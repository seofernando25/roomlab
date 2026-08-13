import { LitElement, css, html } from 'lit';
import type { AccountDto } from '../online/types';
import { api } from '../online/api-client';
import { appTheme } from './app-theme';

export class LandingPage extends LitElement {
  static override styles = [appTheme, css`
    :host { display:block; min-height:100vh; background:#0d527d; }
    .top { min-height:74px; padding:12px max(20px, calc((100vw - 1120px)/2)); display:flex; align-items:center; justify-content:space-between; background:#061f35; border-bottom:3px solid #197ea9; }
    .brand { font-size:25px; } .brand small { display:block; margin-left:8px; color:#9bc8dd; font-size:12px; font-weight:650; letter-spacing:.02em; }
    .hero { position:relative; overflow:hidden; min-height:470px; background:radial-gradient(circle at 30% 20%, #83e3fa 0, #28b8e1 38%, #0b75a7 100%); border-bottom:1px solid #9bd8ec; }
    .hero-inner { max-width:1120px; min-height:470px; margin:auto; padding:34px 26px; display:grid; grid-template-columns:minmax(0, 1.3fr) minmax(320px,.7fr); gap:30px; align-items:center; }
    .visual { position:relative; min-height:365px; display:grid; align-items:end; }
    .visual::before { content:""; position:absolute; inset:18% 5% 2% 0; border-radius:50%; background:rgba(255,255,255,.22); filter:blur(18px); }
    .room-shot { position:relative; width:min(700px,100%); border:4px solid #d7f4ff; border-radius:18px; transform:rotate(-1.5deg); box-shadow:0 24px 60px rgba(0,39,72,.35); image-rendering:auto; }
    .tagline { position:absolute; left:10px; top:8px; max-width:430px; z-index:2; text-shadow:0 2px 0 rgba(0,52,83,.45); }
    .tagline h1 { margin:0; font-size:clamp(34px,5vw,64px); line-height:.94; letter-spacing:-.055em; }
    .tagline p { max-width:410px; margin:12px 0; font-size:17px; font-weight:650; color:#eafaff; }
    .login { padding:20px; background:rgba(5,47,77,.88); border:1px solid rgba(211,246,255,.35); border-radius:15px; box-shadow:0 18px 45px rgba(0,34,61,.28); }
    .login h2 { margin:0 0 7px; font-size:23px; } .login p { margin:0 0 16px; color:#bfe3f2; line-height:1.4; }
    form { display:grid; gap:10px; } .error { padding:9px 10px; border-radius:7px; background:#7b2732; color:#fff; font-size:13px; }
    .privacy { margin-top:12px; color:#9fc9da; font-size:11px; line-height:1.4; }
    .nav-strip { background:#e9f4f8; color:#1b4d68; border-bottom:1px solid #b8d3df; }
    .nav-inner { max-width:900px; margin:auto; display:grid; grid-template-columns:repeat(4,1fr); }
    .nav-item { padding:15px 10px; text-align:center; font-size:12px; font-weight:850; } .nav-item strong { display:block; font-size:20px; margin-bottom:3px; }
    .content { max-width:1120px; margin:auto; padding:30px 24px 50px; }
    .content h2 { margin:0 0 16px; font-size:29px; }
    .feature-grid { display:grid; grid-template-columns:1.25fr .75fr .75fr; gap:14px; }
    .feature { min-height:180px; padding:20px; border-radius:13px; background:#144f76; border:1px solid #367ca4; }
    .feature:first-child { background:linear-gradient(135deg,#8a1841,#541332); }
    .feature h3 { margin:0 0 8px; font-size:21px; } .feature p { color:#bcd8e6; line-height:1.45; }
    .footer { padding:28px; text-align:center; color:#78a8c0; background:#061f35; font-size:12px; }
    @media(max-width:800px){ .hero-inner{grid-template-columns:1fr;padding-top:20px}.visual{min-height:280px}.tagline{position:relative;left:auto;top:auto;margin-bottom:14px}.room-shot{max-height:260px;object-fit:cover}.feature-grid{grid-template-columns:1fr}.brand small{display:none} }
  `];
  #busy = false;
  #error = '';

  override render() {
    return html`
      <header class="top">
        <div class="brand"><span class="brand-mark">R</span><span>ROOM LAB<small>BUILD · HANG OUT · TRADE</small></span></div>
        <span class="muted">Browser beta</span>
      </header>
      <section class="hero">
        <div class="hero-inner">
          <div class="visual">
            <div class="tagline"><h1>Your room.<br>Your people.</h1><p>Build strange spaces together, visit friends, collect furniture and make the hotel your own.</p></div>
            <img class="room-shot" src="/assets/landing/room-preview.png" alt="Room Lab isometric room preview">
          </div>
          <div class="login">
            <div class="eyebrow">Join this browser</div><h2>Choose your username</h2>
            <p>No password yet. This browser gets a private session so nobody can claim your wallet just by typing your name.</p>
            <form @submit=${this.submit}>
              <label class="field"><span>Username</span><input name="username" autocomplete="username" minlength="3" maxlength="18" pattern="[A-Za-z0-9_]+" placeholder="pixel_builder" required></label>
              ${this.#error ? html`<div class="error">${this.#error}</div>` : null}
              <button class="primary" ?disabled=${this.#busy}>${this.#busy ? 'Creating your room key…' : 'Enter Room Lab'}</button>
            </form>
            <div class="privacy">For this beta, account recovery and cross-device sign-in are intentionally not enabled yet. Your username is public; your session credential is not.</div>
          </div>
        </div>
      </section>
      <div class="nav-strip"><div class="nav-inner">
        <div class="nav-item"><strong>▦</strong>ROOMS</div><div class="nav-item"><strong>◈</strong>SHOP</div><div class="nav-item"><strong>♙</strong>FRIENDS</div><div class="nav-item"><strong>✦</strong>BUILD</div>
      </div></div>
      <main class="content">
        <h2>What’s happening in Room Lab</h2>
        <div class="feature-grid">
          <article class="feature"><div class="eyebrow">Build together</div><h3>Stack it, sculpt it, move it live</h3><p>Multi-storey floors, walls, traversal pieces, teleport links and object stacking all use the same authoritative room model.</p></article>
          <article class="feature"><div class="eyebrow">Rooms</div><h3>Visit people</h3><p>Make a room, browse active spaces, jump into a friend’s room and keep building while visitors play.</p></article>
          <article class="feature"><div class="eyebrow">Economy</div><h3>Collect & trade</h3><p>Buy official furniture with credits or list a specific item on the player Marketplace.</p></article>
        </div>
      </main>
      <footer class="footer">Room Lab is an original experimental social room builder inspired by classic virtual worlds.</footer>
    `;
  }

  private readonly submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault(); if (this.#busy) return;
    const form = event.currentTarget as HTMLFormElement;
    const username = String(new FormData(form).get('username') ?? '');
    this.#busy = true; this.#error = ''; this.requestUpdate();
    try {
      const account = await api.claimUsername(username);
      localStorage.setItem('roomlab-profile', JSON.stringify({ userId: account.id, username: account.username }));
      this.dispatchEvent(new CustomEvent<AccountDto>('account-ready', { detail: account, bubbles: true, composed: true }));
    } catch (error) { this.#error = error instanceof Error ? error.message : 'Could not create your account.'; }
    finally { this.#busy = false; this.requestUpdate(); }
  };
}
customElements.define('landing-page', LandingPage);
