// electron-builder afterPack hook: ad-hoc signs the packaged macOS app.
//
// With no Developer ID certificate (`mac.identity: null`), electron-builder
// skips signing entirely, which leaves Electron's own linker signature
// claiming resources the finished bundle doesn't match. Apple Silicon
// refuses to run code with a broken signature, so a downloaded copy is
// reported as "damaged" with no way to open it. An ad-hoc signature ("-")
// needs no certificate and makes the bundle consistent again; users then get
// the ordinary unidentified-developer prompt, which right-click → Open (or
// Privacy & Security → Open Anyway) gets past.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
}
