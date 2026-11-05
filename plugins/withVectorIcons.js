const { withXcodeProject, withInfoPlist } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

module.exports = function withVectorIcons(config) {
  config = withInfoPlist(config, (cfg) => {
    if (!cfg.modResults.UIAppFonts) {
      cfg.modResults.UIAppFonts = [];
    }
    if (!cfg.modResults.UIAppFonts.includes('Ionicons.ttf')) {
      cfg.modResults.UIAppFonts.push('Ionicons.ttf');
    }
    return cfg;
  });

  config = withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const fontSource = path.resolve(
      cfg.modRequest.projectRoot,
      'node_modules/react-native-vector-icons/Fonts/Ionicons.ttf'
    );
    const fontDestination = path.resolve(
      cfg.modRequest.platformProjectRoot,
      'Ionicons.ttf'
    );

    if (fs.existsSync(fontSource)) {
      fs.copyFileSync(fontSource, fontDestination);
      xcodeProject.addResourceFile('Ionicons.ttf');
    }
    return cfg;
  });

  return config;
};
