module.exports = {
  prompt: {
    types: [
      {
        value: "origin",
        name: "origin:     Add original language file",
      },
      {
        value: "translate",
        name: "translate:     Add translated language file",
      },
      {
        value: "maintain",
        name: "maintain:     Maintain the repo",
      },
    ],
    scopes: [
      { value: "zh-HANS", name: "简体中文" },
      { value: "en-US", name: "English (United States)" },
      { value: "fr-FR", name: "French" },
      { value: "ko-KR", name: "Korean" },
      { value: "es-ES", name: "Spanish" },
    ],
  },
};
