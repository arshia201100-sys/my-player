const { withInfoPlist } = require('@expo/config-plugins');

module.exports = function withVectorIcons(config) {
  return withInfoPlist(config, (cfg) => {
    if (!cfg.modResults.UIAppFonts) {
      cfg.modResults.UIAppFonts = [];
    }
    if (!cfg.modResults.UIAppFonts.includes('Ionicons.ttf')) {
      cfg.modResults.UIAppFonts.push('Ionicons.ttf');
    }
    return cfg;
  });
};
