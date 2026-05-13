const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const SNIPPET = [
  '    # fmt/Folly incompatibility with Xcode 16 consteval — force C++17 across all pods',
  '    installer.pods_project.targets.each do |target|',
  '      target.build_configurations.each do |config|',
  "        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'",
  '      end',
  '    end',
].join('\n');

module.exports = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      // Idempotent — skip if already applied
      if (contents.includes("CLANG_CXX_LANGUAGE_STANDARD")) return cfg;

      // Insert just before the final `end` that closes post_install do |installer|
      contents = contents.replace(
        /([ \t]*react_native_post_install\([\s\S]*?\n[ \t]*\))/,
        `$1\n${SNIPPET}`,
      );

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
