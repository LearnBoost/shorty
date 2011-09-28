var request = require('request')

module.exports = function client (url, opts, callback) {
  if ('function' == typeof opts) {
    callback = opts;
    opts = {};
  }

  opts.method = 'POST';
  opts.json = { url: url };
  if (!opts.uri)
    opts.uri = 'https://'+ (process.env.SHORTY_DOMAIN || 'lrn.bt') + '/create';

  request(opts, function (err, res, body) {
    if (err) return callback(err);
    callback(null, body.short);
  });
}
