var request = require('request')

var DEFAULTS = {
    method: 'POST'
  , uri: 'https://'+ (process.env.SHORTY_DOMAIN || 'lrn.bt') + '/create'
};

module.exports = function client (url, opts, callback) {
  if ('function' == typeof opts) {
    callback = opts;
    opts = {};
  }

  opts.__proto__ = DEFAULTS;
  opts.json = { url: url };

  request(opts, function (err, res, body) {
    if (err) return callback(err);
    callback(null, body.short);
  });
}
