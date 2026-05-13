const { withDangerousMod } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');
const path = require('path');
const fs = require('fs');

// Injects a post_install snippet into the Podfile that forces C++17 across all
// pods, fixing the fmt/Folly consteval incompatibility with Xcode 16.
module.exports = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfilePath, 'utf8');

      const snippet = [
        '    # fmt/Folly incompatibility with Xcode 16 consteval — force C++17 across all pods',
        '    installer.pods_project.targets.each do |target|',
        '      target.build_configurations.each do |config|',
        "        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'",
        '      end',
        '    end',
      ].join('\n');

      const result = mergeContents({
        tag:          'withCxx17',
        src:          contents,
        newSrc:       snippet,
        anchor:       /react_native_post_install\(/,
        offset:       5, // insert after the closing ) of react_native_post_install(...)
        comment:      '#',
      });

      if (result.didMerge) {
        fs.writeFileSync(podfilePath, result.contents);
      }
      return cfg;
    },
  ]);
