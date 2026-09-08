# Generated assets — download list

Generated with Higgsfield (`nano_banana_pro`) under one shared art direction.
My sandbox can't reach the CDN, so download these in a browser and save them to
the paths below. **The site works with this folder empty** — every image falls
back gracefully, and the spuds render in 3D regardless.

## Spuds — the seven on your board

These match your actual presentation: loaded tub, white background.

| Save as                                       | Source |
|-----------------------------------------------|--------|
| `food/spuds/just-a-spud.webp`                 | https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/hf_20260812_155934_4d620cca-2bf6-4243-9f75-e8a85526b0b6.png |
| `food/spuds/great-british-classic.webp`       | https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/hf_20260812_155108_b31587e3-81dc-410f-971d-1314012ecf1b.png |
| `food/spuds/just-cheese.webp`                 | https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/hf_20260812_155935_774a9eab-ebee-4225-9690-89d647e1f551.png |
| `food/spuds/spud-father.webp`                 | https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/hf_20260812_155722_2acdf58c-7f41-4c3d-9181-1d26a5f50a3d.png |
| `food/spuds/chilli-con-carne.webp`            | https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/hf_20260812_155108_f3badd41-0114-4901-ae20-e23703d2c271.png |
| `food/spuds/just-chicken.webp`                | https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/hf_20260812_155722_00b8fe5d-6325-447b-a138-0b97d0a1d979.png |
| `food/spuds/tuna-mayo.webp`                   | queued — see chat |

## Heritage — the story section

| Save as                                       | Source |
|-----------------------------------------------|--------|
| `heritage/aylesbury-market.webp`              | https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/hf_20260812_155540_58c7d458-8bcc-427d-b172-647efce1d78b.png |
| `heritage/victorian-potato-seller.webp`       | https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/hf_20260812_155540_d099c5d8-e698-4543-84ef-f17111895977.png |
| `heritage/just-spuds-today.webp`              | queued — see chat |

## Other categories

| Save as                                       | Source |
|-----------------------------------------------|--------|
| `food/panini/panini-feature.webp`             | https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/hf_20260812_000638_a04549c0-7abf-4713-b3a4-72c485ef5f31.png |
| `food/baguette/baguette-feature.webp`         | https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/hf_20260812_000303_4267f44a-3861-4814-8114-eee8fc3f32de.png |
| `food/salad/salad-feature.webp`               | https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/hf_20260812_000303_e5ffb1a7-5748-44da-a65d-546f5afab6e1.png |
| `drinks/coffee/coffee-promo.webp`             | https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/hf_20260812_001241_8576c6ef-7ab4-4beb-9e0c-da6effe52592.png |
| `drinks/thick-shake/shake-promo.webp`         | https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/hf_20260812_001448_e8e47e48-7b41-46de-bdde-f5ca22db369e.png |

## Convert PNG → WebP

Filenames above end `.webp` but downloads are `.png`. Convert, or change the
extension in `src/data/menu.ts` and `src/data/site.ts`.

```bash
npx @squoosh/cli --webp '{"quality":82}' -d food/spuds food/spuds/*.png
```

Knocking the tubs out onto transparency (Higgsfield `remove_background`) will
look better again, since the cards supply their own lighting.

---

## Hero video

| Save as                              | Source          |
|--------------------------------------|-----------------|
| `video/spuds-hero-loop.mp4`          | see chat — generated from the Great British Classic still |

The hero shows the still until the video reports `canplay`, so if this file is
absent nothing breaks — you just get the photograph.
