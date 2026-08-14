import { css } from 'lit';

export const appTheme = css`
  :host { color: #eef8ff; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; }
  button, input, select, textarea { font: inherit; }
  button { cursor: pointer; }
  .brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 950; letter-spacing: -.04em; }
  .brand-mark { width: 36px; height: 36px; border-radius: 8px; display: grid; place-items: center; color: #08203a; background: linear-gradient(#ffe36a, #f6ae2d); border: 2px solid #fff4b5; box-shadow: 0 2px 0 #7d5a12; }
  .panel { background: rgba(8, 37, 61, .92); border: 1px solid rgba(139, 213, 242, .28); border-radius: 14px; box-shadow: 0 16px 42px rgba(0, 18, 34, .22); }
  .soft-panel { background: #f2f8fb; color: #163449; border: 1px solid #c5dae5; border-radius: 12px; }
  .primary { border: 1px solid #95ecae; color: #062e17; font-weight: 800; background: linear-gradient(#70e895, #34bd64); box-shadow: inset 0 1px rgba(255,255,255,.5), 0 2px 0 #176d38; }
  .secondary { border: 1px solid #8cc9e9; color: #eefaff; font-weight: 750; background: linear-gradient(#238bc3, #176f9f); box-shadow: inset 0 1px rgba(255,255,255,.18), 0 2px 0 #0a4769; }
  .ghost { border: 1px solid rgba(155,214,239,.35); color: #eaf8ff; background: rgba(11, 59, 88, .55); }
  .danger { border: 1px solid #efa7a7; color: #fff; background: #a93943; }
  .primary, .secondary, .ghost, .danger { min-height: 38px; padding: 8px 14px; border-radius: 8px; }
  .eyebrow { color: #72cbed; font-size: 12px; font-weight: 850; letter-spacing: .09em; text-transform: uppercase; }
  .muted { color: #9fc5d7; }
  .empty { padding: 30px; text-align: center; color: #8fb7ca; border: 1px dashed rgba(144,200,223,.3); border-radius: 12px; }
  .badge { display: inline-flex; align-items: center; gap: 5px; min-height: 23px; padding: 3px 8px; border-radius: 999px; background: #dceef6; color: #27576f; font-size: 11px; font-weight: 800; }
  .credits { color: #ffd962; font-weight: 900; }
  .section-head { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-bottom: 16px; }
  .section-head h2 { margin: 2px 0 0; font-size: 24px; letter-spacing: -.025em; }
  .section-head p { margin: 4px 0 0; color: #9fc5d7; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
  .card { min-width: 0; padding: 14px; border: 1px solid rgba(130,194,220,.24); background: rgba(10, 48, 74, .82); border-radius: 12px; }
  .card h3 { margin: 0 0 5px; font-size: 16px; }
  .card p { margin: 0; color: #a4c8d9; font-size: 13px; line-height: 1.4; }
  .field { display: grid; gap: 6px; }
  .field > span { font-size: 12px; color: #a9cada; font-weight: 700; }
  input, textarea, select { width: 100%; border: 1px solid #91b9cc; border-radius: 7px; background: #f8fcfe; color: #153248; padding: 9px 10px; outline: none; }
  input:focus, textarea:focus, select:focus { border-color: #34a6da; box-shadow: 0 0 0 3px rgba(47,169,220,.18); }
  @media (max-width: 720px) {
    .card-grid { grid-template-columns: 1fr; }
    .section-head { align-items: start; flex-direction: column; }
    .primary, .secondary, .ghost, .danger { min-height: 44px; }
    input, textarea, select { min-height: 44px; font-size: 16px; }
  }
`;
