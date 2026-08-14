import { css } from 'lit';
import { appTheme } from './app-theme';

export const roomsPageStyles = [appTheme, css`
  :host { display:block; }
  .toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .scope { padding:7px 11px; border-radius:999px; border:1px solid #356f8e; background:#0c4669; color:#dff5ff; }
  .scope.active { background:#e8f7fd; color:#174763; border-color:#c5e8f7; }
  .search { margin-left:auto; max-width:260px; }
  .spacer { height:14px; }
  .room-card { display:grid; gap:10px; }
  .room-top { display:flex; justify-content:space-between; gap:10px; }
  .room-icon { width:58px; height:58px; display:grid; place-items:center; border-radius:9px; background:linear-gradient(135deg,#f2c14e,#d87137); font-size:24px; }
  .room-body { display:grid; grid-template-columns:auto 1fr; gap:11px; }
  .room-meta { display:flex; gap:7px; flex-wrap:wrap; }
  .join { width:100%; }
  .create { margin:0 0 18px; padding:14px; display:grid; grid-template-columns:1fr 1fr auto; gap:10px; align-items:end; }
  .create .wide { grid-column:span 2; }
  .message { margin:10px 0; padding:9px; border-radius:8px; background:#6f2934; }
  @media(max-width:700px){ .scope{min-height:44px}.create{grid-template-columns:1fr}.create .wide{grid-column:auto}.search{margin-left:0;max-width:none} }
`];
