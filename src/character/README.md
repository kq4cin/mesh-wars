# CharacterKit: reference-image crew assets

`npm run check` type-checks this TypeScript package and bundles it into
[`character.js`](../../character.js). The vanilla-JS game loads that bundle directly.

## Artwork, not generated characters

Version 3 replaces the procedural character painters with transparent pixels extracted
from the user-supplied 1408 x 768 reference sheet:

- 29 fixed heads (human, cybernetic and robot variants).
- Three complete illustrations: female human, reptilian and synthetic.
- One native-resolution [PNG atlas](../../assets/crew/crew.png), shared by every character.
- A [manifest](../../assets/crew/sprites.json) containing frame rectangles and figure head crops.

The flattened image is **not a modular animation pack**. Hair, skin, expression, clothing,
armor and weapons are baked into each sprite. Equipment IDs remain gameplay metadata;
changing them does not repaint the sprite. A head-only asset does not acquire a substitute
body in full view. The complete figures have matching head/bust crops from their own pixels.
There are no invented facial expressions or blink frames. Upscaling cannot recover detail
absent from the source. Segmentation may leave a fine outline, particularly on a light background.

These images were supplied by the project owner for this implementation. Their underlying
artwork rights/license have not been independently verified. Confirm permission before
publishing or redistributing them; the repository's code license does not establish artwork rights.

## Architecture

| File | Responsibility |
|---|---|
| `types.ts` | `CharacterRecord`, `CharacterSheet`, `AssetLayer`, `EquipmentVisuals`, animation contracts |
| `sprites.ts` | Typed atlas catalog, deterministic selection, aspect-preserving placement and per-image crops |
| `AssetFactory.ts` | Resolve records, equipment metadata and sprite IDs; LRU of 96 character instances |
| `CharacterAsset.ts` | Z-ordering, layer occlusion, cropping, transforms and compositing |
| `TextureCache.ts` | Decode deduplication, regional rasterization, quantized sizes and a 32 MiB derived-texture LRU |
| `animation.ts` | Whole-image hit/nod hooks, damage tint and KO dimming; static at rest |
| `dom.ts` | Accessible canvas markup, hydration, per-view state, HP change tracking and DPR-aware sizing |

Each shipped character currently has **one flattened image layer**. The compositor still
supports independent `AssetLayer` objects for a future genuinely aligned art pack:
layers sort by `z`, hidden slots are removed, and each layer draws with its own blend,
opacity and bone transform. `source-over` preserves transparent edges. Hit/KO passes use
`source-atop` so they do not paint the transparent background.

An atlas source maps its native `frame` into a logical `destination` rectangle without
distorting its proportions. Only the intersection with the requested crop is rasterized.
Both the atlas coordinates and destination participate in texture keys.

The single source atlas is decoded once per factory cache, separately from the 32 MiB
derived-texture budget (under 4 MiB decoded for this catalog). Concurrent requests share
one decode. Failed loads log `[CharacterKit]` warnings and are throttled for ten seconds.
Custom applications loading many different atlas URLs should manage their cache lifecycle;
the source-image map is not a general-purpose byte-budgeted multi-atlas store.

The service worker precaches the atlas with the shell, even before any Crew view is opened.
The factory resolves its absolute URL relative to the bundle, including GitHub Pages subpaths.

## Usage

```js
CharacterKit.configure({ jobColors: { Pilot: '#38d9ff' } });
container.innerHTML = CharacterKit.portraitHTML(
  { seed: 123, job: 'Pilot' },
  { crop: 'bust', track: 'crew-7', hp: 12 }
);
CharacterKit.hydrate(container);
```

The same seed selects the same image regardless of job/HP. Choose a particular image with
`customization.spriteId`; available values are in `CharacterKit.ARTWORK_IDS`.

```js
const asset = CharacterKit.factory().create({
  seed: 123,
  job: 'Marine',
  customization: { spriteId: 'figure_1' }
});
await asset.prefetch(canvas.width, canvas.height, 'full');
asset.render(canvas.getContext('2d'), 0, 0, canvas.width, canvas.height, {
  crop: 'full', clear: true
});
```

`full`, `bust` and `head` preserve aspect ratio and contain the crop in the target canvas.
HP loss triggers a brief damage flash on tracked views. Reduced-motion users receive the
flash without shaking. `happy`/`determined` states remain accepted for game compatibility
but do not change facial pixels.

## Re-extracting the sheet

The source attachment itself is not committed. The local extraction tool requires
Python, Pillow, NumPy and OpenCV (`opencv-python-headless`). It is not a runtime dependency.
Use the same 1408 x 768 source: the panel bounds and figure silhouettes are source-specific.

```powershell
python tools\slice_sheet.py C:\path\to\sheet.png assets\crew C:\path\to\contact.png
npm run check
```

Extraction preserves native RGB pixels, removes the blueprint background with connected
components/GrabCut and authored figure silhouettes, then packs the alpha cutouts into
the atlas. Only the atlas and manifest are written to the output directory; the optional
contact sheet is for review. Review all three figures and head edges after regeneration.

## Regression checks

Serve the repository and open [`tools/character-tests.html`](../../tools/character-tests.html).
It checks all 32 sprites in all three crops, deterministic identity/DOM round-tripping,
texture sharing and eviction, transparent KO dimming, reduced motion and the final damage
frame. It has no test-library dependency.
