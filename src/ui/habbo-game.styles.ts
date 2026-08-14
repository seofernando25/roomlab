import { css } from 'lit';

export const habboGameStyles = css`
  :host { display: block; width: 100%; height: 100%; color: #edf4f2; }
  .game { position: relative; width: 100%; height: 100%; overflow: hidden; background: #101a24; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; outline: none; touch-action: none; user-select: none; -webkit-user-select: none; }
  .topbar {
    position: absolute; top: 18px; left: 20px; right: 20px; display: flex;
    justify-content: space-between; align-items: flex-start; gap: 14px; pointer-events: none;
  }
  .room-card, .controls {
    pointer-events: auto; border: 3px solid #1a2830; background: #334b52;
    box-shadow: 4px 4px 0 rgba(0,0,0,.42), inset 0 0 0 2px #668079;
  }
  .room-card { display: flex; align-items: center; gap: 10px; border-radius: 5px; padding: 7px 10px 7px 7px; }
  .badge {
    width: 38px; height: 38px; display: grid; place-items: center; color: #46351e;
    background: #f3c85a; border: 3px solid #70501f; border-radius: 3px;
    box-shadow: inset 0 0 0 2px #ffe594; font-weight: 900;
  }
  .room-meta strong { display: block; font-size: 14px; letter-spacing: .01em; }
  .room-meta span { display: block; margin-top: 3px; color: #c2d0cc; font-size: 11px; }
  .controls { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; padding: 5px; border-radius: 5px; }
  button {
    border: 2px solid #17272d; cursor: pointer; color: #f1f2dd; background: #54706e;
    box-shadow: inset 0 2px #77938d, 0 3px 0 #142329;
    transition: transform .08s ease, background .08s ease; font: inherit;
  }
  button:hover:not(:disabled) { background: #64847d; transform: translateY(-1px); }
  button:active:not(:disabled) { transform: translateY(1px); box-shadow: none; }
  button:focus-visible { outline: 2px solid #f3c85a; outline-offset: 2px; }
  button:disabled { cursor: default; opacity: .46; }
  .icon-btn { min-width: 43px; height: 36px; border-radius: 3px; font-weight: 800; }
  .mode-btn { min-width: 104px; height: 36px; padding: 0 10px; border-radius: 3px; font-weight: 900; }
  .mode-btn.play { background: #4d8466; }
  .mode-btn.edit { background: #a66b36; }
  .catalogue-open { min-width: 88px; background: #66769a; }
  .catalogue-open.active { background: #8c609f; }
  .view-control { position: relative; }
  .view-open { min-width: 66px; }
  .view-open.active { background: #6d648b; }
  .view-menu {
    position: absolute; top: 43px; right: 0; width: 220px; padding: 9px;
    border: 3px solid #1a2830; border-radius: 5px; background: #e7ece9; color: #33484d;
    box-shadow: 4px 5px 0 rgba(0,0,0,.38), inset 0 0 0 1px rgba(255,255,255,.55);
  }
  .view-menu label { display: block; }
  .view-menu label + label { margin-top: 8px; }
  .view-menu label > span { display: block; margin-bottom: 4px; color: #50656a; font-size: 9px; font-weight: 900; }
  .view-menu select {
    width: 100%; height: 32px; border: 2px solid #869794; border-radius: 4px; background: #fff; color: #2d4145;
    padding: 0 7px; font: inherit; font-size: 10px; font-weight: 800;
  }
  .view-rotate-row { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 5px; }
  .view-rotate-row button { min-height: 31px; border-radius: 3px; font-size: 9px; font-weight: 900; }
  .view-hint { margin-top: 7px; color: #718084; font-size: 8px; text-align: center; }
  .catalogue {
    position: absolute; left: 18px; bottom: 18px; z-index: 3; pointer-events: auto;
    filter: drop-shadow(0 4px 5px rgba(0,0,0,.12));
  }
  .selection-panel {
    position: absolute; right: 18px; bottom: 18px; z-index: 3; width: 270px; pointer-events: auto;
  }
  .selection-title { font-size: 12px; font-weight: 900; color: #263b3f; }
  .selection-meta { margin-top: 3px; color: #657579; font-size: 9px; font-weight: 700; }
  .selection-chips { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 7px; }
  .selection-chip {
    padding: 2px 5px; border: 1px solid #8aa09d; border-radius: 3px;
    background: #f0f5f3; color: #435d62; font-size: 8px; font-weight: 900;
  }
  .selection-row { display: flex; gap: 6px; margin-top: 8px; }
  .selection-row button { flex: 1; min-height: 34px; border-radius: 3px; font-size: 10px; font-weight: 900; }
  .danger { background: #793e40; }
  .help {
    position: absolute; left: 20px; bottom: 18px; z-index: 2; max-width: min(760px, calc(100vw - 40px));
    color: #b4c5c8; font-size: 11px; text-shadow: 0 1px 2px #000; pointer-events: none;
  }
  .game.edit.editor-open .help { bottom: 444px; }
  .tile-note { color: #f0d68c; }
  .toast {
    position: absolute; left: 50%; top: 82px; z-index: 5; transform: translateX(-50%);
    padding: 7px 12px; border-radius: 3px; background: #743e44; border: 3px solid #3d2529;
    box-shadow: 3px 3px #101820; font-size: 11px;
  }
  :host([capture]) .topbar,
  :host([capture]) .catalogue,
  :host([capture]) .selection-panel,
  :host([capture]) .help,
  :host([capture]) .toast { display: none; }
  @media (max-width: 900px) {
    .room-meta span { display: none; }
    .controls { max-width: 330px; }
    .selection-panel { right: 10px; bottom: 10px; width: 240px; }
  }
  @media (max-width: 680px) {
    .topbar { top: calc(10px + env(safe-area-inset-top)); left: 64px; right: 10px; }
    .room-card { display: none; }
    .controls { margin-left: auto; max-width: calc(100vw - 74px); gap: 4px; }
    .icon-btn, .mode-btn { height: 44px; min-height: 44px; }
    .mode-btn { min-width: 90px; padding: 0 8px; }
    .catalogue-open { min-width: 72px; }
    .view-open { min-width: 56px; }
    .view-menu { top: 50px; right: 0; width: min(250px, calc(100vw - 84px)); }
    .view-menu select { height: 44px; font-size: 16px; }
    .view-rotate-row button { min-height: 44px; font-size: 10px; }
    .catalogue { left: 0; right: 0; bottom: 0; width: 100%; filter: drop-shadow(0 -4px 8px rgba(0,0,0,.24)); }
    .selection-panel { left: 10px; right: 10px; bottom: calc(10px + env(safe-area-inset-bottom)); width: auto; }
    .selection-row button { min-height: 44px; }
    .game.editor-open .selection-panel { display: none; }
    .help { display: none; }
    .toast { top: calc(66px + env(safe-area-inset-top)); max-width: calc(100vw - 90px); }
  }
`;
