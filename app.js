
/**
 * Module dependencies.
 */

var express = require('express')
  , stylus = require('stylus')
  , http = require('http')
  , base60 = require('./lib/base60')
  , morgan = require('morgan')
  , bodyParser = require('body-parser')
  , errorHandler = require('errorhandler')
  , crypto = require('crypto')
  , url = require('url')
  , nib = require('nib')
  , fs = require('fs')

/**
 * Determine environment.
 */

var env = process.env.NODE_ENV || 'development';

const config = {
  port: process.env.PORT || 3000,
  domain: process.env.SHORTY_DOMAIN || 'https://lrn.cc',
  redis_url: process.env.SHORTY_REDIS_URL || 'redis://localhost:6379',

}

/**
 * Create db.
 */

redis = require('redis').createClient(config.redis_url);

/**
 * Redis lock.
 * Uses "shorty-lock" as the key name.
 * Default timeout of 10 seconds.
 */

var lock = require('redis-lock')(redis).bind(null, 'shorty-lock', 10000);

/**
 * Create app.
 */

var app = module.exports = express();
var server = http.createServer(app);
/**
 * Basic middleware.
 */

if ('development' == env) {
  app.use(morgan('dev'));
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(stylus.middleware({ src: __dirname + '/public/', compile: css }));
app.use(express.static(__dirname + '/public'));

/**
 * Reads a file
 *
 * @api private
 */

function read (file) {
  return fs.readFileSync(__dirname + '/' + file, 'utf8');
}

/**
 * Stylus compiler
 */

function css (str, path) {
  return stylus(str)
    .set('filename', path)
    .set('compress', 'production' == env)
    .use(nib())
    .import('nib');
};

/**
 * Configure app.
 */

app.set('views', __dirname + '/views');
app.set('view engine', 'pug');
app.set('domain', config.domain);

/**
 * GET index page.
 */

app.get('/', function (req, res, next) {
  redis.hlen('urls', function (err, length) {
    if (err) return next(err);
    res.render('index', { count: length });
  });
});

/**
 * POST a url.
 */

app.post('/', validate, exists, function (req, res, next) {
  var url = req.body.url
    , parsed = req.body.parsed
    , private = req.body.private
    , length
    , short
    , obj

  lock(function (unlock) {
    // get count of urls
    redis.hlen('urls', onLenth);
    function onLenth (err, len) {
      if (err) return next(500);
      length = len;

      if (private) {
        short = crypto.randomBytes(20).toString('hex');
      } else {
        short = base60.toString(length ? length + 1 : 0);
      }

      // next save the short url with the original url to the "urls" hash
      redis.hset('urls', short, url, onUrlsSet);
    }
    function onUrlsSet (err) {
      if (err) return next(err);

      // next save the original url with the short url to the "urls-hash" hash
      redis.hset('urls-hash', url, short, onUrlsHashSet);
    }
    function onUrlsHashSet (err) {
      if (err) return next(err);

      // finally create a "transaction" object for this action
      obj = {
          type: 'url created'
        , url: url
        , short: short
        , date: new Date
      };

      // push the transaction object to the "transitions" list
      redis.lpush('transactions', JSON.stringify(obj), onTransactions);
    }
    function onTransactions (err) {
      if (err) return next(500);

      obj.parsed = parsed;
      res.send({ short: app.set('domain') + '/' + short });

      process.nextTick(unlock);
    }
  });
});

/**
 * Checkes that the URL is valid
 */

function validate (req, res, next) {
  var parsed = req.body.parsed = url.parse(req.body.url);

  if (!req.body.url || !parsed.protocol || !parsed.host) {
    return res.send(400, { error: 'Bad `url` field' });
  }

  next();
};

/**
 * Content negotiation.
 */

function accept(type) {
  return function(req, res, next){
    if (req.accepts(type)) return next();
    next('route');
  }
}

/**
 * Checks that the URL doesnt exist already
 */

function exists (req, res, next) {
  if (req.body.private) {
    // for "private" links, always return a new one
    return next();
  }
  redis.hget('urls-hash', req.body.url, function (err, val) {
    if (err) return next(err);
    if (val) return res.send({ short: app.set('domain') + '/' + val });
    next();
  });
}

/**
 * GET :short url to perform redirect.
 */

app.get('/:short', function (req, res, next) {
  redis.hget('urls', req.params.short, function (err, val) {
    if (err) return next(err);
    if (!val) return res.status(404).render('404');

    lock(function (unlock) {
      redis.lpush('transactions', JSON.stringify({
          type: 'url visited'
        , url: val
        , short: req.params.short
        , date: Date.now()
        , ip: req.socket.remoteAddress
        , headers: req.headers
      }), function (err) {
        if (err) console.error(err);
      });

      res.redirect(val);

      process.nextTick(unlock);
    });
  });
});


/**
 * Erorr handlers
 */
if (env === 'development') {
  app.use(errorHandler());

} else if (env === 'production') {
  app.use(function (err, req, res, next) {
    res.status(500).json({ status: 'error' });
  })
}

/**
 * Listen.
 */

if (!module.parent) {
  server.listen(config.port, function () {
    console.error('   app listening on http://localhost:' + config.port);
  });

  process.on('uncaughtException', function (e) {
    console.error(e && e.stack ? e.stack : e);
  });
}
