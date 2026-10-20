#!/usr/bin/env node
/**
 * Cross-Platform Standalone POS Runner for Just Spuds Aylesbury
 * Works on Windows, macOS, Linux, and ChromeOS.
 * Launches the in-store till in a dedicated, distraction-free application window.
 */

import { spawn, exec } from 'node:child_process'
import { platform } from 'node:os'
import { existsSync } from 'node:fs'

const isLocal = process.argv.includes('--local') || process.argv.includes('local')
const TARGET_URL = isLocal ? 'http://localhost:5173/pos' : 'https://pos.justspuds.uk'

console.log('===================================================')
console.log('  JUST SPUDS AYLESBURY - UNIVERSAL POS TERMINAL')
console.log('===================================================')
console.log(`Operating System: ${platform()}`)
console.log(`Connecting to: ${TARGET_URL}`)

const os = platform()

function launchApp(command, args) {
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.unref()
    console.log('✓ POS Terminal launched in dedicated window.')
    process.exit(0)
  } catch {
    fallbackOpen()
  }
}

function fallbackOpen() {
  console.log('Opening in default web browser...')
  const cmd = os === 'win32' ? `start "" "${TARGET_URL}"` : os === 'darwin' ? `open "${TARGET_URL}"` : `xdg-open "${TARGET_URL}"`
  exec(cmd, (err) => {
    if (err) console.error('Failed to open browser automatically. Please open:', TARGET_URL)
    process.exit(0)
  })
}

const flags = [
  `--app=${TARGET_URL}`,
  '--start-maximized',
  '--disable-pinch',
  '--overscroll-history-navigation=0',
  '--no-first-run',
]

if (os === 'win32') {
  const possiblePaths = [
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LocalAppData}\\Google\\Chrome\\Application\\chrome.exe`,
  ]
  const found = possiblePaths.find((p) => p && existsSync(p))
  if (found) {
    launchApp(found, flags)
  } else {
    fallbackOpen()
  }
} else if (os === 'darwin') {
  if (existsSync('/Applications/Google Chrome.app')) {
    launchApp('open', ['-na', 'Google Chrome', '--args', ...flags])
  } else if (existsSync('/Applications/Microsoft Edge.app')) {
    launchApp('open', ['-na', 'Microsoft Edge', '--args', ...flags])
  } else {
    fallbackOpen()
  }
} else {
  // Linux / BSD / ChromeOS
  const linuxBrowsers = ['chromium-browser', 'chromium', 'google-chrome', 'microsoft-edge']
  let launched = false
  for (const b of linuxBrowsers) {
    try {
      launchApp(b, flags)
      launched = true
      break
    } catch {
      // try next
    }
  }
  if (!launched) fallbackOpen()
}
