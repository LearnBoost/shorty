
/**
 * Module dependencies.
 */

var express = require('express')
  , stylus = require('stylus')
  , sio = require('socket.io')
  , base60 = require('./base60')
  , jadevu = require('jadevu')
  , url = require('url')
  , nib = require('nib')
  , fs = require('fs')

/**
 * Determine environment.
 */

var env = process.env.NODE_ENV || 'development';

/**
 * Create db.
 */

redis = require('redis').createClient(
    process.env.SHORTY_REDIS_PORT
  , process.env.SHORTY_REDIS_HOST
);

/**
 * Redis lock.
 * Uses "shorty-lock" as the key name.
 * Default timeout of 10 seconds.
 */

var lock = require('redis-lock')(redis).bind(null, 'shorty-lock', 10000);

/**
 * Create app.
 */

app = module.exports = express.createServer();

/**
 * Basic middleware.
 */

if ('development' == env) {
  app.use(express.logger('dev'));
}
if (process.env.SHORTY_BASIC_AUTH) {
  app.use(express.basicAuth.apply(null, process.env.SHORTY_BASIC_AUTH.split(':')));
}
app.use(express.bodyParser());
app.use(stylus.middleware({ src: __dirname + '/public/', compile: css }));
app.use(express.static(__dirname + '/public'));

/**
 * Socket.IO
 */

var io = sio.listen(app);

// quiet :)

io.set('log level', 0);

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

app.configure(function () {
  app.set('views', __dirname);
  app.set('view engine', 'jade');
  app.set('domain', process.env.SHORTY_DOMAIN || 'lrn.cc');
});

/**
 * Development configuration.
 */

app.configure('development', function () {
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

/**
 * Production configuration.
 */

app.configure('production', function () {
  app.use(express.errorHandler());
});

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
    , length
    , short
    , obj

  lock(function (unlock) {
    // get count of urls
    redis.hlen('urls', onLenth);
    function onLenth (err, len) {
      if (err) return next(500);
      length = len;
      short = base60.toString(length ? length + 1 : 0);

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
      io.of('/main').volatile.emit('total', length + 1);
      io.of('/stats').volatile.emit('url created', short, parsed, Date.now());
      res.send({ short: 'https://' + app.set('domain') + '/' + short });

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
  redis.hget('urls-hash', req.body.url, function (err, val) {
    if (err) return next(err);
    if (val) return res.send({ short: 'https://' + app.set('domain') + '/' + val });
    next();
  });
}

/**
 * GET JSON statistics.
 */

app.get('/stats', accept('json'), function (req, res, next) {
  redis.lrange('transactions', 0, 100, function (err, vals) {
    if (err) return next(err);
    res.send(vals.map(JSON.parse));
  });
});

/**
 * GET statistics.
 */

app.get('/stats', function (req, res, next) {
  redis.lrange('transactions', 0, 100, function (err, vals) {
    if (err) return next(err);
    res.render('stats', { transactions: vals ? vals.map(function (v) {
      v = JSON.parse(v);
      v.parsed = url.parse(v.url);
      delete v.url;
      return v;
    }).reverse() : [] });
  });
});

/**
 * GET :short url to perform redirect.
 */

app.get('/:short', function (req, res, next) {
  redis.hget('urls', req.params.short, function (err, val) {
    if (err) return next(err);
    if (!val) return res.render('404');

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

      io.of('/stats').volatile.emit(
          'url visited'
        , req.params.short
        , url.parse(val)
        , Date.now()
      );

      res.redirect(val);

      process.nextTick(unlock);
    });
  });
});

/**
 * Listen.
 */

if (!module.parent) {
  app.listen(process.env.PORT || 3000, function () {
    var addr = app.address();
    console.error('   app listening on ' + addr.address + ':' + addr.port);
  });

  process.on('uncaughtException', function (e) {
    console.error(e && e.stack ? e.stack : e);
  });
}
