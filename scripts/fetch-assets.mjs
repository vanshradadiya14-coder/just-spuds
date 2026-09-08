/**
 * Downloads every generated image into public/assets.
 *
 *   npm run assets
 *
 * Safe to re-run: existing files are skipped unless you pass --force.
 * Nothing else in the build depends on this having been run — the site
 * falls back gracefully — but the site looks like a wireframe without it.
 */
import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public', 'assets')
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3HQOMRVSN4opWpwTrdyODLFGEQP/'
const force = process.argv.includes('--force')

/** target path → CDN filename */
const MANIFEST = {
  'food/spuds/just-a-spud.png':            'hf_20260812_171117_328cda82-d204-4085-aa71-3215bfd5388d.png',
  'food/spuds/great-british-classic.png':  'hf_20260812_171117_ab5eb3dd-5cfb-4dbb-95f9-02fbee706df4.png',
  'food/spuds/just-cheese.png':            'hf_20260812_171117_6b90cb80-2f79-4837-bf2f-eaf16ac3ff7a.png',
  'food/spuds/spud-father.png':            'hf_20260812_171117_0ce7c741-572e-4b0e-a843-80dfc62b227a.png',
  'food/spuds/tuna-mayo.png':              'hf_20260812_171147_d2655e8f-f50c-44b4-8b03-58a03db91a5b.png',
  'food/spuds/chilli-con-carne.png':       'hf_20260812_171147_58e4b440-529c-4827-8a5f-7a3f61389cd3.png',
  'food/spuds/just-chicken.png':           'hf_20260812_171147_a52c4241-7ba1-49bf-bd61-65c44d9d5c6b.png',

  'food/baguette/plain-chicken.png':       'hf_20260812_184028_a06c0913-6239-4a91-9793-395847d8b10e.png',
  'food/baguette/chicken-mayo.png':        'hf_20260812_184028_b658f9d9-c7a6-445a-9f8b-e1d53e80427e.png',
  'food/baguette/chicken-tikka.png':       'hf_20260812_184028_3c7dcc00-9a61-4380-b774-7596b5d55f92.png',
  'food/baguette/coronation.png':          'hf_20260812_184028_a3f6c092-9d82-436c-a5b4-16907c87e618.png',
  'food/baguette/bbq-chicken.png':         'hf_20260812_184104_369d66bc-f2a3-4b37-8dfe-9521d25280a5.png',
  'food/baguette/tuna-mayo.png':           'hf_20260812_184104_a5ebb5fe-2fc5-404f-b9a4-9e2bac74201e.png',
  'food/baguette/tuna-crunch.png':         'hf_20260812_184104_e93aceb8-60e0-4fd9-9473-c5b3a3633abb.png',

  'food/panini/pulled-chicken.png':        'hf_20260812_184104_ef970671-f3f7-4848-902c-fbf7a190be2e.png',
  'food/panini/tuna-cheese.png':           'hf_20260812_184152_a4b4c2fd-7e73-494e-bfcf-d28000a4342e.png',
  'food/panini/cheese-tomato.png':         'hf_20260812_184151_77a91eeb-dbdf-4ab1-95ec-ceb7435f338e.png',

  'food/salad/just-salad.png':             'hf_20260812_184152_709bf120-cab9-4c0b-9f27-fd51a7c164d1.png',
  'food/salad/tuna-salad.png':             'hf_20260812_184152_2a516548-5f1b-4285-bdec-48bd3b2b3167.png',
  'food/salad/chicken-salad.png':          'hf_20260812_184304_e96d61db-67f0-4ad8-bcc9-7b9c1ebb9fda.png',

  'food/baguette/baguette-feature.png':    'hf_20260812_000303_4267f44a-3861-4814-8114-eee8fc3f32de.png',
  'food/panini/panini-feature.png':        'hf_20260812_000638_a04549c0-7abf-4713-b3a4-72c485ef5f31.png',
  'food/salad/salad-feature.png':          'hf_20260812_000303_e5ffb1a7-5748-44da-a65d-546f5afab6e1.png',
  'food/rice-bowl/rice-bowl-feature.png':  'hf_20260812_000303_1dd5c204-c8e5-4e34-bc49-28ef17726dda.png',
  'food/pita/pita-feature.png':            'hf_20260812_000303_13f16b4d-5025-4b74-8dd2-d02b0f09624a.png',

  'drinks/coffee/coffee-promo.png':        'hf_20260812_001241_8576c6ef-7ab4-4beb-9e0c-da6effe52592.png',
  'drinks/thick-shake/shake-promo.png':    'hf_20260812_001448_e8e47e48-7b41-46de-bdde-f5ca22db369e.png',

  'heritage/aylesbury-market.png':         'hf_20260812_155540_58c7d458-8bcc-427d-b172-647efce1d78b.png',
  'heritage/victorian-potato-seller.png':  'hf_20260812_155540_d099c5d8-e698-4543-84ef-f17111895977.png',
  'heritage/just-spuds-today.png':         'hf_20260812_160258_4d25172a-f44c-48a9-a9c0-fcdcea079fd1.png',
}

const exists = (p) => access(p).then(() => true, () => false)
const kb = (n) => `${(n / 1024).toFixed(0)} kB`

let ok = 0, skipped = 0, failed = 0

console.log(`\nFetching ${Object.keys(MANIFEST).length} assets into public/assets\n`)

for (const [target, remote] of Object.entries(MANIFEST)) {
  const dest = join(PUBLIC, target)

  if (!force && (await exists(dest))) {
    console.log(`  skip   ${target}`)
    skipped++
    continue
  }

  try {
    const res = await fetch(CDN + remote)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1000) throw new Error('suspiciously small response')
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, buf)
    console.log(`  ok     ${target}  (${kb(buf.length)})`)
    ok++
  } catch (err) {
    console.error(`  FAIL   ${target}  — ${err.message}`)
    failed++
  }
}

console.log(`\n${ok} downloaded, ${skipped} already present, ${failed} failed.`)
if (failed) {
  console.error('\nSome assets failed. The site still runs — missing images fall back.')
  process.exitCode = 1
} else {
  console.log('Done. Run `npm run dev`.\n')
}
