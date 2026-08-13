# Human avatar extraction and placement notes

Recovered from six UnityFS bundles (Unity 2020.3.15f2).

## Extracted
- shirt_m_checks: 196 embedded Texture2D sprites
- trousers_u_baggy: 56 embedded Texture2D sprites
- shoes_u_skater: 54 embedded Texture2D sprites
- hh_human_body: 251 embedded Texture2D sprites
- hh_human_face: 295 embedded Texture2D sprites
- hh_human_leg: 280 embedded Texture2D sprites
- Total: 1132

## The important placement rule

The Unity Sprite objects themselves do **not** contain useful avatar registration:
- pivot = (0.5, 0.5)
- Sprite offset = (0, 0)
- pixels-per-unit = 100
- sprite rect = the full Texture2D

The actual avatar registration is stored in the custom MonoBehaviour:
`AvatarPartBundleXml -> avatarPartAsset -> parts[] -> param`

For these files `param.key` is `offset`, with values such as `-22,50`.

For raster compositing, the recovered rule is:

    top_left_x = -offset_x
    top_left_y = -offset_y

All body/clothing pieces are placed into the same shared coordinate system using that rule.
The included `placement_demo.png` was reconstructed only from the extracted PNGs and these offsets.

Example, direction 2:
- body h_std_bd_1_2_0: offset (-22, 50) -> top-left (22, -50)
- leg h_std_lg_1_2_0: offset (-22, 25) -> top-left (22, -25)
- head h_std_hd_1_2_0: offset (-20, 74) -> top-left (20, -74)
- trousers h_std_lg_2129_2_0: offset (-23, 24) -> top-left (23, -24)
- shirt chest h_std_ch_2100_2_0: offset (-21, 48) -> top-left (21, -48)
- shoes h_std_sh_2111_2_0: offset (-23, 8) -> top-left (23, -8)

That is why independently cropped images with different dimensions still line up correctly.

## Filename structure

Most names follow:

    <scale>_<action>_<part>_<set/item id>_<direction>_<frame>

Examples:
- h_std_bd_1_2_0
- h_wlk_lg_2129_0_3
- h_std_ch_2100_2_0
- h_std_sh_2111_2_0

Common part codes visible here:
- bd = body
- hd = head
- lh / rh = left/right hand or arm layers
- lg = legs/trousers
- ch = shirt chest
- ls / rs = shirt sleeve layers
- sh = shoes
- fc = face
- ey = eyes / facial-expression overlay
- sd = ground shadow

Common action codes visible here include `std`, `wlk`, `sit`, `lay`, `wav`, `spk`,
`crr`, `drk`, and several facial-expression/action codes.

The first token `h` is the embedded full-size asset set. Clothing metadata also contains many
`sh_*` logical registrations. Those `sh_*` entries generally have approximately half-sized
offset coordinates, but their own Texture2D images are not embedded in these bundles, so they
are retained in the CSV as metadata-only entries instead of being invented.

## Layering

The offsets solve spatial registration, but exact front/back draw order is a separate concern.
It depends on direction/action and is not fully specified by these six bundles alone.
The demo uses a practical order (shadow -> base anatomy -> face -> clothing -> hands -> shoes)
that produces a correctly registered avatar, but a game-accurate renderer should also obtain
the external avatar draw-order/action configuration.

## Files

- `sprites/<bundle>/` — exact recovered PNG textures
- `metadata/all_parts.csv` — decoded names, action/part/direction/frame, offsets, dimensions, pivots
- `metadata/bundle_metadata.json` — full recovered AvatarPartBundleXml data
- `previews/placement_demo.png` — reconstructed standing avatar in directions 0,1,2,3,7
