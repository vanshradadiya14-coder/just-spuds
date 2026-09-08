# Just Spuds — Asset Drop Folder

The site renders correctly with this folder **completely empty**. Every image
goes through `SmartImage`, which falls back to a branded plate graphic if a file
is missing, and the hero/configurator fall back further to procedural 3D. So you
can add assets gradually with no risk of breaking the page.

## Where each file goes

| Path                                          | Used by                    | Ratio |
|-----------------------------------------------|----------------------------|-------|
| `food/spuds/spuds-hero.webp`                  | Hero (non-WebGL fallback)  | 16:9  |
| `food/spuds/spuds-hero-mobile.webp`           | Hero on portrait screens   | 9:16  |
| `food/spuds/spuds-feature.webp`               | Signature scene + menu card| 4:3   |
| `food/spuds/spuds-configurator.webp`          | Configurator fallback      | 1:1   |
| `food/panini/panini-feature.webp`             | Menu card                  | 4:3   |
| `food/baguette/baguette-feature.webp`         | Menu card                  | 4:3   |
| `food/wraps/wrap-feature.webp`                | Menu card                  | 4:3   |
| `food/rice-bowl/rice-bowl-feature.webp`       | Menu card                  | 4:3   |
| `food/pita/pita-feature.webp`                 | Menu card                  | 4:3   |
| `food/salad/salad-feature.webp`               | Menu card                  | 4:3   |
| `drinks/coffee/coffee-promo.webp`             | Promotion                  | 4:5   |
| `drinks/thick-shake/shake-promo.webp`         | Promotion                  | 4:5   |

Optional, wired but not required:

| Path                              | Used by                        |
|-----------------------------------|--------------------------------|
| `video/spuds-hero-loop.mp4`       | Hero background motion         |
| `3d/spuds-configurator.glb`       | Replaces the procedural spud   |

## Converting the generated PNGs

The Higgsfield images arrive as PNG. Convert before shipping — it typically
cuts file size by 70–85%:

```bash
# one file
npx @squoosh/cli --webp '{"quality":82}' -d . spuds-hero.png

# or with ImageMagick
magick spuds-hero.png -quality 82 spuds-hero.webp
```

Cutting the food out onto transparency looks considerably better than a
rectangular photo, because the cards already supply their own lighting and
shadow. `remove_background` in Higgsfield does this well.

## Art direction (keep this consistent for any new asset)

- Light warm-grey polished concrete surface
- Dark charcoal slate serving board under hot items
- Seamless soft cool-grey studio background, subtle vignette
- Key light upper-left, warm fill, shallow depth of field
- No text, no logos, no people in the frame
