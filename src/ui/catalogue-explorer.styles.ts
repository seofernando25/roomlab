import { css } from 'lit';

export const catalogueExplorerStyles = css`
  :host { display:block; width:min(500px, calc(100vw - 32px)); color:#2a3b3f; }
  hotel-panel { width:100%; }
  .close { width:24px; height:24px; border:2px solid #26373d; border-radius:4px; color:#fff; background:#8a4c4b; font:inherit; font-weight:900; cursor:pointer; }
  .layout { display:grid; grid-template-columns:82px minmax(0,1fr); gap:8px; min-height:320px; max-height:min(540px, calc(100vh - 160px)); }
  .rail { display:flex; flex-direction:column; gap:5px; padding-right:7px; border-right:2px solid #b3bebb; }
  .rail button { min-height:48px; border:2px solid transparent; border-radius:5px; color:#536469; background:transparent; font:inherit; font-size:9px; font-weight:900; cursor:pointer; }
  .rail button:hover { background:#d8dfdd; }
  .rail button.active { color:#fff; border-color:#3c5961; background:#648995; box-shadow:inset 0 2px #82a5ae, 0 2px #8c9d9a; }
  .rail .mark { display:block; margin:auto auto 3px; font-size:15px; }
  .main { min-width:0; overflow:auto; padding-right:2px; scrollbar-width:thin; }
  .toolbar { display:flex; gap:6px; margin-bottom:7px; }
  input, select { min-width:0; height:33px; border:2px solid #869794; border-radius:4px; background:#fff; color:#2d4145; font:inherit; font-size:10px; font-weight:800; padding:0 7px; }
  input { flex:1; }
  .active-tool {
    display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:7px; padding:6px 8px;
    border:2px solid #698c76; border-radius:5px; background:#e7f0e9; color:#365746;
  }
  .active-tool strong { flex:0 0 auto; font-size:9px; }
  .active-tool span { min-width:0; color:#65766b; font-size:8px; text-align:right; }
  .placement-rotate { flex:0 0 auto; min-height:32px; border:2px solid #566f5e; border-radius:4px; background:#678970; color:#fff; font:inherit; font-size:8px; font-weight:900; cursor:pointer; }
  .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; align-content:start; }
  .object-card, .tool-card, .finish, .level, .pair, .action {
    border:2px solid #8e9d99; border-radius:5px; background:#f6f8f7; color:#34484d; font:inherit; cursor:pointer;
    box-shadow:inset 0 2px rgba(255,255,255,.78),0 2px #c1cac7;
  }
  .object-card { min-height:88px; padding:7px; display:grid; grid-template-columns:72px minmax(0,1fr); gap:8px; text-align:left; align-items:center; }
  .object-card:hover,.tool-card:hover,.finish:hover,.level:hover { border-color:#62838a; background:#fff; }
  .object-card.active,.tool-card.active,.finish.active,.level.active { border-color:#527d8e; background:#e3f0f3; box-shadow:0 0 0 2px #bdd8df; }
  .preview { position:relative; width:68px; height:68px; display:grid; place-items:center; overflow:hidden; border:2px solid #9ca9a6; border-radius:5px; background:linear-gradient(#edf2f0,#d8e2df); }
  catalogue-object-preview { width:62px; height:62px; }
  .footprint-badge { position:absolute; right:2px; bottom:2px; min-width:18px; min-height:15px; display:grid; place-items:center; border:1px solid #4e6870; border-radius:3px; background:rgba(238,246,244,.94); box-shadow:0 1px 0 rgba(0,0,0,.18); }
  .footprint { display:grid; gap:1px; transform:rotate(30deg) skewY(-18deg) scale(.48); }
  .footprint i { width:9px; height:9px; background:#79aab5; border:1px solid #496c74; box-shadow:inset 1px 1px #a9cdd2; }
  .name { display:block; font-size:10px; font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .meta { display:block; margin-top:4px; color:#748286; font-size:8px; font-weight:800; line-height:1.25; }
  .section-title { margin:2px 0 6px; color:#50666b; font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:.04em; }
  .tools { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; }
  .tool-card { min-height:48px; padding:6px; text-align:left; font-size:8px; line-height:1.25; }
  .tool-card strong { display:block; margin-bottom:2px; color:#314d53; font-size:10px; }
  .finishes { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin-top:6px; }
  .finish { padding:5px; min-width:0; }
  .swatch { display:block; height:27px; border:1px solid #556d70; border-radius:3px; box-shadow:inset 0 2px rgba(255,255,255,.25); }
  .finish span:last-child { display:block; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:7px; font-weight:900; }
  .storey-context { margin-bottom:9px; padding-bottom:8px; border-bottom:2px solid #c1cac7; }
  .storey-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:5px; }
  .storey-heading > span { min-width:0; }
  .storey-heading strong { display:block; color:#40585d; font-size:9px; text-transform:uppercase; letter-spacing:.04em; }
  .storey-heading small { display:block; margin-top:1px; color:#758286; font-size:8px; font-weight:800; }
  .levels { display:flex; gap:4px; min-width:0; overflow-x:auto; padding:2px 1px 3px; }
  .level { flex:0 0 auto; min-width:72px; min-height:38px; padding:4px 7px; text-align:left; }
  .level strong { display:block; font-size:9px; }
  .level span { display:block; margin-top:2px; color:#728084; font-size:7px; }
  .action { min-width:34px; min-height:34px; padding:0 6px; font-size:9px; font-weight:900; }
  .action.primary { color:#fff; border-color:#3f5a48; background:#60826b; }
  .add-storey { min-height:30px; white-space:nowrap; }
  .storey-settings { margin-top:4px; border:1px solid transparent; border-radius:4px; }
  .storey-settings[open] { border-color:#aeb9b6; background:#eef2f1; }
  .storey-settings summary { padding:4px 5px; color:#68777a; font-size:8px; font-weight:900; cursor:pointer; }
  .storey-settings-body { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; align-items:center; padding:0 6px 6px; }
  .storey-settings-body p { margin:0; color:#6d7b7e; font-size:8px; line-height:1.35; }
  .storey-settings-body > div { display:flex; gap:4px; }
  .storey-settings-body .action { min-height:29px; white-space:nowrap; }
  .hint { margin-top:7px; padding:6px 7px; border:1px solid #a5b0ad; border-radius:4px; background:#dde4e2; color:#667579; font-size:8px; line-height:1.35; }
  .hint strong { color:#365159; }
  .pairing { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; padding:8px; border:2px solid #a0aba8; border-radius:5px; background:#e2e7e5; }
  .pairing strong { display:block; font-size:10px; }
  .pairing span { display:block; margin-top:3px; color:#718083; font-size:8px; line-height:1.3; }
  .pair-list { display:grid; gap:5px; margin-top:8px; }
  .pair { display:grid; grid-template-columns:1fr auto; gap:7px; align-items:center; padding:6px 7px; text-align:left; cursor:default; }
  .pair strong { display:block; font-size:9px; }
  .pair span { display:block; margin-top:2px; color:#718084; font-size:8px; }
  .remove { min-height:28px; border:2px solid #624143; border-radius:4px; color:#fff; background:#8c5557; font:inherit; font-size:8px; font-weight:900; cursor:pointer; }
  .empty { padding:18px; text-align:center; color:#798689; font-size:9px; }
  @media(max-width:620px){
    :host{width:100vw;max-width:none}
    .close{width:34px;height:34px}
    .layout{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr);gap:7px;min-height:0;height:min(56dvh,480px);max-height:min(56dvh,480px)}
    .rail{flex-direction:row;gap:4px;padding:0 0 6px;border-right:0;border-bottom:2px solid #b3bebb;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none}
    .rail::-webkit-scrollbar{display:none}.rail button{flex:1 0 72px;min-width:72px;min-height:48px}.rail .mark{display:inline;margin:0 4px 0 0}
    .main{min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding-right:1px}
    .toolbar{position:sticky;top:0;z-index:2;padding-bottom:5px;background:#e7ece9}.toolbar input,.toolbar select{height:44px;font-size:16px}
    .active-tool{display:grid;grid-template-columns:1fr auto;align-items:center}.active-tool span{grid-column:1;text-align:left}.placement-rotate{grid-column:2;grid-row:1/3;min-height:44px}
    .grid{grid-template-columns:1fr}.object-card{min-height:92px}.tools{grid-template-columns:repeat(3,1fr)}.tool-card{min-height:52px}.finishes{grid-template-columns:repeat(2,1fr)}
    .action{min-width:44px;min-height:44px}.level{min-height:44px}.remove{min-height:44px}.hint{font-size:9px}
  }
`;
