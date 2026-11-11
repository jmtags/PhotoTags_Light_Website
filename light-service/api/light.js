// Separate function and raw webhook body; existing APK webhook is untouched.
const { createLightHandler } = require('../server/light-api');
module.exports = createLightHandler();
module.exports.config = { api: { bodyParser: false } };
