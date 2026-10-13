/** electron-builder afterPack 钩子：给 .app 做临时签名（ad-hoc），与滑洲云图 CI 做法一致。
 * 无签名时 macOS 报“包是坏的”；临时签名只报“无法验证开发者”，右键打开一次即可。
 * 仅在 macOS 上执行；签名失败则让构建失败，不静默出无签名包。 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function afterPack(context) {
  if (process.platform !== 'darwin') return;
  const appName = context.packager?.appInfo?.productFilename
    || fs.readdirSync(context.appOutDir).find((f) => f.endsWith('.app'));
  // productFilename 不带 .app 后缀，bundle 名需补上，否则 codesign 路径错误
  const bundle = appName.endsWith('.app') ? appName : `${appName}.app`;
  const appPath = path.join(context.appOutDir, bundle);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
  console.log(`ad-hoc 签名完成: ${appPath}`);
};
